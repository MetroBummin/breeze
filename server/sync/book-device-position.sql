-- Per-device reading positions. Apply after server/sync/book-cloud.sql.
-- Each device writes only its own row, so a late upload cannot erase another
-- device's place. Older builds keep calling breeze_put_book_position; that
-- function still updates public.positions and mirrors the accepted write onto
-- the shared legacy device row. Do not drop public.positions or this table
-- to roll back. Ship this migration before the app build that calls
-- breeze_put_device_book_position.
begin;

create table if not exists public.book_device_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (book_id ~ '^[0-9a-f]{64}$'),
  device_id text not null check (char_length(device_id) between 1 and 80),
  locator jsonb not null check (
    jsonb_typeof(locator) = 'object'
    and octet_length(locator::text) <= 4000
  ),
  read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, device_id)
);

alter table public.book_device_positions enable row level security;
drop policy if exists book_device_positions_owner_read on public.book_device_positions;
create policy book_device_positions_owner_read on public.book_device_positions
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.book_device_positions from public, anon, authenticated;
grant select on public.book_device_positions to authenticated;
grant select, insert, update, delete on public.book_device_positions to service_role;

create schema if not exists private;

create or replace function private.book_position_read_at(locator jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text;
  ms double precision;
begin
  raw := locator->>'t';
  if raw is null or raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
    return to_timestamp(0);
  end if;
  ms := raw::double precision;
  if ms <> ms or ms < 0 then
    return to_timestamp(0);
  end if;
  if ms > 253402300799000 then
    ms := 253402300799000;
  end if;
  return to_timestamp(ms / 1000.0);
end;
$$;
revoke all on function private.book_position_read_at(jsonb) from public, anon, authenticated;
grant execute on function private.book_position_read_at(jsonb) to service_role;

create or replace function private.mirror_legacy_book_position(
  expected_user_id uuid,
  book_id text,
  locator jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.book_device_positions (user_id, book_id, device_id, locator, read_at, updated_at)
  values (
    expected_user_id,
    mirror_legacy_book_position.book_id,
    'legacy',
    mirror_legacy_book_position.locator,
    private.book_position_read_at(mirror_legacy_book_position.locator),
    now()
  )
  on conflict on constraint book_device_positions_pkey do update
    set locator = excluded.locator,
        read_at = excluded.read_at,
        updated_at = now();
end;
$$;
revoke all on function private.mirror_legacy_book_position(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.mirror_legacy_book_position(uuid, text, jsonb) to service_role;

-- Keep the place already stored for this account. A later device write must
-- not replace this row; conflict does nothing.
insert into public.book_device_positions (user_id, book_id, device_id, locator, read_at, updated_at)
select positions.user_id,
       positions.book_id,
       'legacy',
       positions.data->'locator',
       private.book_position_read_at(positions.data->'locator'),
       positions.updated_at
from public.positions
where positions.book_id ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(positions.data->'locator') = 'object'
on conflict (user_id, book_id, device_id) do nothing;

create or replace function public.breeze_put_device_book_position(
  expected_user_id uuid,
  book_id text,
  device_id text,
  locator jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linked text;
begin
  if expected_user_id is null or auth.uid() is distinct from expected_user_id then
    raise insufficient_privilege using message = 'Book account changed';
  end if;
  if book_id !~ '^[0-9a-f]{64}$'
     or device_id is null or char_length(device_id) < 1 or char_length(device_id) > 80
     or device_id = 'legacy' or device_id ~ '[[:cntrl:]]'
     or locator is null or jsonb_typeof(locator) <> 'object'
     or octet_length(locator::text) > 4000
     or locator ?| array['paras', 'text', 'body', 'imgSrc', 'cover']
  then
    raise exception 'Invalid reading position' using errcode = '22023';
  end if;
  select status into linked from public.book_cloud
    where user_id = expected_user_id and book_cloud.book_id = breeze_put_device_book_position.book_id;
  if linked is null or linked not in ('pending', 'ready') then
    raise exception 'Book is not linked' using errcode = '42501';
  end if;
  insert into public.book_device_positions (user_id, book_id, device_id, locator, read_at, updated_at)
  values (
    expected_user_id,
    breeze_put_device_book_position.book_id,
    breeze_put_device_book_position.device_id,
    breeze_put_device_book_position.locator,
    private.book_position_read_at(breeze_put_device_book_position.locator),
    now()
  )
  on conflict on constraint book_device_positions_pkey do update
    set locator = excluded.locator,
        read_at = excluded.read_at,
        updated_at = now();
  return jsonb_build_object('ok', true, 'device_id', breeze_put_device_book_position.device_id, 'locator', breeze_put_device_book_position.locator);
end;
$$;
revoke all on function public.breeze_put_device_book_position(uuid, text, text, jsonb) from public, anon;
grant execute on function public.breeze_put_device_book_position(uuid, text, text, jsonb) to authenticated;

-- Older builds still pass a revision. A matching revision updates the shared
-- row and the legacy device row. A stale revision writes nothing.
create or replace function public.breeze_put_book_position(
  expected_user_id uuid,
  book_id text,
  expected_revision text,
  next_revision text,
  locator jsonb
) returns jsonb
language plpgsql
security definer
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
    perform private.mirror_legacy_book_position(expected_user_id, book_id, locator);
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
  perform private.mirror_legacy_book_position(expected_user_id, book_id, locator);
  return jsonb_build_object('ok', true, 'revision', next_revision, 'locator', locator);
end;
$$;
revoke all on function public.breeze_put_book_position(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.breeze_put_book_position(uuid, text, text, text, jsonb) to authenticated;

commit;
