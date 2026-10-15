-- REVIEW ONLY. Do not apply this file as part of the change.
-- Selective book links and reading positions. File bytes live in private R2,
-- never in this table. Authenticated clients can read their own rows and
-- update a position. They cannot insert a ready object or choose its key.
begin;

create table if not exists public.book_cloud (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (book_id ~ '^[0-9a-f]{64}$'),
  title text not null default '' check (octet_length(title) <= 500),
  author text not null default '' check (octet_length(author) <= 500),
  kind text not null check (kind in ('pdf', 'epub', 'txt')),
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 2147483648),
  object_key text not null,
  status text not null check (status in ('pending', 'ready', 'deleted')),
  tombstone text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id),
  check (object_key = user_id::text || '/' || book_id)
);

alter table public.book_cloud enable row level security;
drop policy if exists book_cloud_owner_read on public.book_cloud;
create policy book_cloud_owner_read on public.book_cloud
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.book_cloud from public, anon, authenticated;
grant select on public.book_cloud to authenticated;

create schema if not exists private;
create or replace function private.enforce_book_cloud_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used_books integer;
  used_bytes bigint;
begin
  if new.status = 'deleted' then
    return new;
  end if;
  select count(*), coalesce(sum(byte_size), 0)
    into used_books, used_bytes
  from public.book_cloud
  where user_id = new.user_id and status <> 'deleted' and book_id <> new.book_id;
  if used_books >= 40 then
    raise exception 'book_cap' using errcode = 'P0001';
  end if;
  if used_bytes + new.byte_size > 2147483648 then
    raise exception 'byte_cap' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_book_cloud_cap() from public, anon, authenticated;

drop trigger if exists book_cloud_cap on public.book_cloud;
create trigger book_cloud_cap
  before insert or update on public.book_cloud
  for each row execute function private.enforce_book_cloud_cap();

create table if not exists public.positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
alter table public.positions enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'positions' and policyname = 'own positions'
  ) then
    create policy "own positions" on public.positions
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
revoke all on public.positions from anon;
grant select, insert, update, delete on public.positions to authenticated;

create or replace function public.breeze_put_book_position(
  expected_user_id uuid,
  book_id text,
  expected_revision text,
  next_revision text,
  locator jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current jsonb;
  linked text;
begin
  if expected_user_id is null or auth.uid() is distinct from expected_user_id then
    raise insufficient_privilege using message = 'Book account changed';
  end if;
  if book_id !~ '^[0-9a-f]{64}$' or next_revision is null or length(next_revision) = 0
     or length(next_revision) > 80 or locator is null or jsonb_typeof(locator) <> 'object'
     or octet_length(locator::text) > 4000
     or locator ?| array['paras', 'text', 'body', 'imgSrc', 'cover']
  then
    raise exception 'Invalid reading position' using errcode = '22023';
  end if;
  select status into linked from public.book_cloud
    where user_id = expected_user_id and book_cloud.book_id = breeze_put_book_position.book_id;
  if linked is null or linked not in ('pending', 'ready') then
    raise exception 'Book is not linked' using errcode = '42501';
  end if;
  select data into current from public.positions
    where user_id = expected_user_id and positions.book_id = breeze_put_book_position.book_id
    for update;
  if current is null then
    if expected_revision is not null then
      return jsonb_build_object('ok', false);
    end if;
    insert into public.positions (user_id, book_id, data)
    values (expected_user_id, book_id, jsonb_build_object('v', 1, 'revision', next_revision, 'locator', locator));
    return jsonb_build_object('ok', true, 'revision', next_revision, 'locator', locator);
  end if;
  if current->>'revision' is distinct from expected_revision then
    return jsonb_build_object('ok', false, 'revision', current->>'revision', 'locator', current->'locator');
  end if;
  update public.positions
    set data = jsonb_build_object('v', 1, 'revision', next_revision, 'locator', locator),
        updated_at = now()
    where user_id = expected_user_id and positions.book_id = breeze_put_book_position.book_id
      and data->>'revision' = expected_revision;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'revision', next_revision, 'locator', locator);
end;
$$;
revoke all on function public.breeze_put_book_position(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.breeze_put_book_position(uuid, text, text, text, jsonb) to authenticated;

commit;

-- Rollback: stop serving the new client and leave these rows in place.
-- Do not drop the tables as an automatic rollback. R2 objects are removed by
-- the book-cloud function when a reader turns a link off, deletes a book, or
-- deletes the account.
