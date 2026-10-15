-- REVIEW PROPOSAL ONLY. Never applied to a remote database by this PR.
-- Preserve the legacy wordbook row/schema while sending only changed records.
begin;
create function public.breeze_patch_wordbook(
  expected_user_id uuid, expected_revision text, next_revision text, patch_words jsonb, patch_dead jsonb
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer; removed_words text[]; removed_dead text[];
begin
  -- The SDK may acquire a newer auth token after the caller captured its patch.
  -- Bind the request to that captured owner before reading any account row.
  if expected_user_id is null or auth.uid() is distinct from expected_user_id
    then raise insufficient_privilege using message='Wordbook account changed'; end if;
  if expected_revision is null or next_revision is null or length(next_revision)=0
    or expected_revision=next_revision or jsonb_typeof(patch_words)<>'object'
    or jsonb_typeof(patch_dead)<>'object' or patch_words is null or patch_dead is null
    then raise exception 'Invalid wordbook patch'; end if;
  if exists(select 1 from jsonb_each(patch_words) as entry where jsonb_typeof(entry.value) not in ('object','null'))
    or exists(select 1 from jsonb_each(patch_dead) as entry where jsonb_typeof(entry.value) not in ('number','null'))
    then raise exception 'Invalid wordbook patch record'; end if;
  select coalesce(array_agg(key),array[]::text[]) into removed_words
    from jsonb_each(patch_words) where value='null'::jsonb;
  select coalesce(array_agg(key),array[]::text[]) into removed_dead
    from jsonb_each(patch_dead) where value='null'::jsonb;
  update public.words set data=data || jsonb_build_object(
    'words',(coalesce(data->'words','{}'::jsonb)-removed_words)||coalesce((select jsonb_object_agg(key,value) from jsonb_each(patch_words) where value<>'null'::jsonb),'{}'::jsonb),
    'dead',(coalesce(data->'dead','{}'::jsonb)-removed_dead)||coalesce((select jsonb_object_agg(key,value) from jsonb_each(patch_dead) where value<>'null'::jsonb),'{}'::jsonb),
    'revision',next_revision,'updatedAt',floor(extract(epoch from clock_timestamp())*1000)
  ) where user_id=expected_user_id and key='__breeze_wordbook_v1__'
    and data->>'revision'=expected_revision;
  get diagnostics changed=row_count;
  -- A repeated request after a lost ACK is a successful no-op. A subsequent
  -- competing revision returns false, requiring the normal CAS conflict read.
  return changed=1 or exists(select 1 from public.words where user_id=expected_user_id
    and key='__breeze_wordbook_v1__' and data->>'revision'=next_revision);
end $$;
revoke all on function public.breeze_patch_wordbook(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.breeze_patch_wordbook(uuid,text,text,jsonb,jsonb) to authenticated;
commit;

-- Rollback: disable the new client before revoking this RPC. Keep the existing
-- words rows unchanged: old clients can still read their complete snapshots.
