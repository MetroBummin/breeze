-- Additive ink sync for linked books. Safe to apply on a database that already
-- has public.book_cloud: it creates book_ink, owner read, and a merge RPC.
-- It does not drop or rewrite book bytes, positions, or existing ink rows.
-- File bytes stay in R2. This table stores stroke revisions only.
-- Rollback: stop serving the client (INK_SYNC false). Do not drop book_ink.
begin;

create table if not exists public.book_ink (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (book_id ~ '^[0-9a-f]{64}$'),
  page integer not null check (page >= 1 and page <= 100000),
  stroke_id uuid not null,
  rev bigint not null check (rev > 0 and rev <= 9007199254740991),
  deleted boolean not null default false,
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, page, stroke_id),
  check (deleted = (payload is null)),
  check (payload is null or (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 24000))
);

alter table public.book_ink enable row level security;
drop policy if exists book_ink_owner_read on public.book_ink;
create policy book_ink_owner_read on public.book_ink
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.book_ink from public, anon, authenticated;
grant select on public.book_ink to authenticated;
grant select, insert, update, delete on public.book_ink to service_role;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.merge_book_ink(
  expected_user_id uuid,
  book_id text,
  page integer,
  ops jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linked text;
  op jsonb;
  sid uuid;
  next_rev bigint;
  gone boolean;
  body jsonb;
  existing_rev bigint;
  existing_deleted boolean;
  existing_bytes integer;
  applied jsonb := '[]'::jsonb;
  page_rows integer;
  book_bytes bigint;
  incoming_bytes integer;
begin
  if expected_user_id is null or auth.uid() is distinct from expected_user_id then
    raise insufficient_privilege using message = 'Ink account changed';
  end if;
  if book_id !~ '^[0-9a-f]{64}$' or page is null or page < 1 or page > 100000
     or jsonb_typeof(ops) <> 'array' or jsonb_array_length(ops) > 80 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  select status into linked from public.book_cloud
    where user_id = expected_user_id and book_cloud.book_id = merge_book_ink.book_id
    for update;
  if linked is null or linked not in ('pending', 'ready') then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  select count(*) into page_rows from public.book_ink
    where user_id = expected_user_id and book_ink.book_id = merge_book_ink.book_id
      and book_ink.page = merge_book_ink.page;
  select coalesce(sum(octet_length(book_ink.payload::text)), 0) into book_bytes
    from public.book_ink
    where user_id = expected_user_id and book_ink.book_id = merge_book_ink.book_id
      and book_ink.deleted = false;
  for op in select value from jsonb_array_elements(ops) loop
    if jsonb_typeof(op) <> 'object'
       or op->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or op->>'rev' !~ '^[1-9][0-9]{0,15}$'
       or jsonb_typeof(op->'deleted') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'bad_stroke', 'applied', applied, 'rejected', op->>'id');
    end if;
    sid := (op->>'id')::uuid;
    next_rev := (op->>'rev')::bigint;
    gone := (op->>'deleted')::boolean;
    body := case when gone then null else op->'stroke' end;
    if next_rev > 9007199254740991 then
      return jsonb_build_object('ok', false, 'error', 'bad_stroke', 'applied', applied, 'rejected', sid);
    end if;
    if not gone and (body is null or jsonb_typeof(body) <> 'object' or octet_length(body::text) > 24000) then
      return jsonb_build_object('ok', false, 'error', 'bad_stroke', 'applied', applied, 'rejected', sid);
    end if;
    select book_ink.rev, book_ink.deleted, coalesce(octet_length(book_ink.payload::text), 0)
      into existing_rev, existing_deleted, existing_bytes
      from public.book_ink
      where user_id = expected_user_id and book_ink.book_id = merge_book_ink.book_id
        and book_ink.page = merge_book_ink.page and book_ink.stroke_id = sid
      for update;
    if found and (existing_rev > next_rev or (existing_rev = next_rev and (existing_deleted or not gone))) then
      applied := applied || jsonb_build_array(sid::text);
      continue;
    end if;
    incoming_bytes := case when body is null then 0 else octet_length(body::text) end;
    if not found and page_rows >= 4000 then
      return jsonb_build_object('ok', true, 'error', 'ink_cap', 'applied', applied);
    end if;
    if book_bytes - coalesce(existing_bytes, 0) + incoming_bytes > 8000000 then
      return jsonb_build_object('ok', true, 'error', 'ink_cap', 'applied', applied);
    end if;
    if found then
      update public.book_ink
        set rev = next_rev, deleted = gone, payload = body, updated_at = now()
        where user_id = expected_user_id and book_ink.book_id = merge_book_ink.book_id
          and book_ink.page = merge_book_ink.page and book_ink.stroke_id = sid;
      book_bytes := book_bytes - coalesce(existing_bytes, 0) + incoming_bytes;
    else
      insert into public.book_ink (user_id, book_id, page, stroke_id, rev, deleted, payload)
      values (expected_user_id, merge_book_ink.book_id, merge_book_ink.page, sid, next_rev, gone, body);
      page_rows := page_rows + 1;
      book_bytes := book_bytes + incoming_bytes;
    end if;
    applied := applied || jsonb_build_array(sid::text);
  end loop;
  return jsonb_build_object('ok', true, 'applied', applied);
end;
$$;

revoke all on function private.merge_book_ink(uuid, text, integer, jsonb) from public, anon;
grant execute on function private.merge_book_ink(uuid, text, integer, jsonb) to authenticated, service_role;

create or replace function public.breeze_merge_book_ink(
  expected_user_id uuid,
  book_id text,
  page integer,
  ops jsonb
) returns jsonb
language sql
security invoker
set search_path = public
as $$
  select private.merge_book_ink(expected_user_id, book_id, page, ops);
$$;

revoke all on function public.breeze_merge_book_ink(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.breeze_merge_book_ink(uuid, text, integer, jsonb) to authenticated, service_role;

create or replace function private.delete_book_ink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.book_ink where user_id = old.user_id and book_id = old.book_id;
    return old;
  end if;
  if new.status = 'deleted' then
    delete from public.book_ink where user_id = new.user_id and book_id = new.book_id;
  end if;
  return new;
end;
$$;

revoke all on function private.delete_book_ink() from public, anon, authenticated;
drop trigger if exists book_ink_forget on public.book_cloud;
create trigger book_ink_forget
  after update or delete on public.book_cloud
  for each row execute function private.delete_book_ink();

commit;
