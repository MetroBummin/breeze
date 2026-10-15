-- REVIEW PROPOSAL ONLY. Do not apply as part of this PR.
-- Learning metadata must never be placed in public.words: older applications
-- interpret unrecognized rows there as legacy vocabulary.
begin;

create table public.study_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key = 'learning-v1'),
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data ?& array['version', 'revision', 'payload']
    and data->>'version' = '1'
    and jsonb_typeof(data->'revision') = 'string'
    and length(data->>'revision') > 0
    and jsonb_typeof(data->'payload') = 'object'
  ),
  primary key (user_id, key)
);

alter table public.study_state enable row level security;
create policy study_state_owner on public.study_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.study_state from anon;
grant select, insert, update, delete on public.study_state to authenticated;

comment on table public.study_state is
  'Per-account study snapshots, set exclusions/tombstones, and preserved test summaries; no book files, body text, or images.';

-- Replace only the explicitly changed existing sets. The expected revision
-- protects unrelated devices; a losing writer reads/merges before retrying.
-- SECURITY INVOKER keeps the same owner RLS as ordinary table operations.
create function public.breeze_patch_study_sets(
  expected_user_id uuid, expected_revision text, next_revision text, changed_sets jsonb
) returns boolean language plpgsql security invoker set search_path = public as $$
declare
  changed_count integer;
begin
  -- Do not let a delayed SDK dispatch move a captured A patch into B's row.
  if expected_user_id is null or auth.uid() is distinct from expected_user_id
    then raise insufficient_privilege using message='Study account changed'; end if;
  if expected_revision is null or next_revision is null or length(next_revision)=0
    or changed_sets is null or jsonb_typeof(changed_sets)<>'array'
    or exists (select 1 from jsonb_array_elements(changed_sets) s
      where jsonb_typeof(s)<>'object' or not(s ? 'id') or jsonb_typeof(s->'id')<>'string')
    or (select count(*) from jsonb_array_elements(changed_sets)) <>
       (select count(distinct s->>'id') from jsonb_array_elements(changed_sets) s)
  then raise exception 'Invalid study set patch' using errcode='22023';end if;

  update public.study_state state set data = jsonb_set(
    jsonb_set(state.data,'{payload,sets,sets}',(
      select coalesce(jsonb_agg(coalesce(patch.value,existing.value) order by existing.ordinal),'[]'::jsonb)
      from jsonb_array_elements(state.data#>'{payload,sets,sets}') with ordinality existing(value,ordinal)
      left join lateral (select p.value from jsonb_array_elements(changed_sets) p(value)
        where p.value->>'id'=existing.value->>'id') patch on true
    )), '{revision}',to_jsonb(next_revision))
  where state.user_id=expected_user_id and state.key='learning-v1'
    and state.data->>'revision'=expected_revision
    and jsonb_typeof(state.data#>'{payload,sets,sets}')='array'
    and not exists (select 1 from jsonb_array_elements(changed_sets) patch
      where not exists (select 1 from jsonb_array_elements(state.data#>'{payload,sets,sets}') item
        where item->>'id'=patch->>'id'));
  get diagnostics changed_count = row_count;
  return changed_count=1;
end;
$$;
revoke all on function public.breeze_patch_study_sets(uuid,text,text,jsonb) from public,anon;
grant execute on function public.breeze_patch_study_sets(uuid,text,text,jsonb) to authenticated;

commit;

-- Rollback: first stop serving the new sync client. Keep/export this table until
-- every required account snapshot has been preserved. Disabling the new client
-- requires no data deletion. Do not DROP the table as an automatic rollback.
