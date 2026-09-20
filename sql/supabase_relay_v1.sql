-- Breeze relay v1. ADDITIVE. Target: hrtfhojbhqvaoiulspto only.
-- Applied 2026-09-20 as migration 20260920053847 / add_breeze_relay_v1.
-- Source retained for audit/rebuild; do not re-run blindly. No words/positions/sync_pairings changes.
-- All access is Worker service-role RPC. Browser roles deliberately get NO policies.
begin;
create table public.relay_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  data jsonb not null default '{"v":1,"devices":{},"everApproved":false}',
  reserved_bytes bigint not null default 0 check(reserved_bytes between 0 and 268435456),
  active_count integer not null default 0 check(active_count between 0 and 8),
  file_count integer not null default 0 check(file_count between 0 and 512),
  rate_minute bigint not null default 0, rate_count integer not null default 0,
  event_floor bigint not null default 0,
  check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384)
);
create table public.relay_files (
  user_id uuid not null references public.relay_accounts(user_id) on delete cascade,
  file_id text not null check(file_id ~ '^[A-Za-z0-9_-]{32}$'),
  doc jsonb not null,
  next_due bigint,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,file_id),
  check(jsonb_typeof(doc)='object' and octet_length(doc::text)<=12288),
  check(doc->>'fileId'=file_id),
  check((doc->>'reservedBytes')::bigint between 0 and 268435456)
);
create index relay_due_idx on public.relay_files(next_due) where next_due is not null;
create table public.relay_events (
  user_id uuid not null references public.relay_accounts(user_id) on delete cascade,
  seq bigint not null, file_id text, kind text not null,
  audience uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,seq)
);
create index relay_events_retention_idx on public.relay_events(created_at);
create table public.relay_nonces (
  user_id uuid not null references public.relay_accounts(user_id) on delete cascade,
  device_id uuid not null, nonce uuid not null,
  expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
  primary key(user_id,device_id,nonce)
);
create index relay_nonces_expiry_idx on public.relay_nonces(expires_at);
create table public.relay_maintenance (
  id boolean primary key default true check(id),
  sweep_cursor text not null default '' check(octet_length(sweep_cursor)<=8192)
);
insert into public.relay_maintenance(id) values(true);
alter table public.relay_accounts enable row level security;
alter table public.relay_files enable row level security;
alter table public.relay_events enable row level security;
alter table public.relay_nonces enable row level security;
alter table public.relay_maintenance enable row level security;
revoke all on public.relay_accounts, public.relay_files, public.relay_events, public.relay_nonces, public.relay_maintenance from public, anon, authenticated;
grant select,insert,update,delete on public.relay_accounts, public.relay_files, public.relay_events, public.relay_nonces, public.relay_maintenance to service_role;

create function public.relay_context(p_user uuid, p_file text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.relay_accounts%rowtype;
begin
  insert into public.relay_accounts(user_id) values(p_user) on conflict do nothing;
  select * into strict a from public.relay_accounts where user_id=p_user;
  return jsonb_build_object('account',a.data,'revision',a.revision::text,
    'reserved_bytes',a.reserved_bytes,'active_count',a.active_count,'file_count',a.file_count,
    'now',floor(extract(epoch from clock_timestamp())*1000)::bigint,
    'file',(select doc from public.relay_files where user_id=p_user and file_id=p_file));
end $$;

-- Account-level compare-and-swap makes device approval, quotas, recipients, leases,
-- ACK closing, and per-account event cursor ordering atomic across Workers/PoPs.
create function public.relay_commit(p_user uuid,p_expected bigint,p_account jsonb,
  p_file_id text,p_file jsonb,p_notify boolean,p_device uuid default null,p_nonce uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.relay_accounts%rowtype; old_doc jsonb; n bigint;
  bytes bigint; active_n integer; files_n integer; minute_n bigint; used integer;
  targets uuid[]; seq_n bigint;
begin
  select * into strict a from public.relay_accounts where user_id=p_user for update;
  if a.revision<>p_expected then return '{"error":"CONFLICT"}'; end if;
  if p_nonce is not null and exists(select 1 from public.relay_nonces where user_id=p_user and device_id=p_device and nonce=p_nonce) then
    return '{"error":"REPLAY"}';
  end if;
  if (p_nonce is null)<>(p_device is null) then raise exception 'invalid proof tuple'; end if;
  n:=floor(extract(epoch from clock_timestamp())*1000)::bigint; minute_n:=n/60000;
  used:=case when a.rate_minute=minute_n then a.rate_count else 0 end;
  if p_nonce is not null and used>=60 then return '{"error":"RATE_LIMIT"}'; end if;
  if p_account is null or jsonb_typeof(p_account->'devices')<>'object' or
     (select count(*) from jsonb_object_keys(p_account->'devices'))>8 then raise exception 'invalid account'; end if;
  if (p_file is null)<>(p_file_id is null) then raise exception 'invalid file tuple'; end if;
  bytes:=a.reserved_bytes; active_n:=a.active_count; files_n:=a.file_count;
  if p_file is not null then
    if p_file->>'fileId'<>p_file_id or p_file->>'reservedBytes' is null or p_file->>'active' is null then raise exception 'invalid file'; end if;
    select doc into old_doc from public.relay_files where user_id=p_user and file_id=p_file_id;
    bytes:=bytes-coalesce((old_doc->>'reservedBytes')::bigint,0)+(p_file->>'reservedBytes')::bigint;
    active_n:=active_n-coalesce((old_doc->>'active')::boolean::integer,0)+(p_file->>'active')::boolean::integer;
    files_n:=files_n+case when old_doc is null then 1 else 0 end;
    if bytes>268435456 or active_n>8 or files_n>512 then return '{"error":"CAPACITY"}'; end if;
  end if;
  if p_nonce is not null then
    insert into public.relay_nonces(user_id,device_id,nonce) values(p_user,p_device,p_nonce);
  end if;
  seq_n:=a.revision+1;
  update public.relay_accounts set revision=seq_n,data=p_account,reserved_bytes=bytes,
    active_count=active_n,file_count=files_n,
    rate_minute=case when p_nonce is not null then minute_n else rate_minute end,
    rate_count=case when p_nonce is not null then used+1 else rate_count end
    where user_id=p_user;
  if a.data is distinct from p_account then
    -- A revoked device/withdrawn consent cannot hold up cleanup. No old sync tables.
    update public.relay_files set next_due=least(coalesce(next_due,n),n) where user_id=p_user;
  end if;
  if p_file is not null then
    insert into public.relay_files(user_id,file_id,doc,next_due) values(p_user,p_file_id,p_file,(p_file->>'nextDue')::bigint)
      on conflict(user_id,file_id) do update set doc=excluded.doc,next_due=excluded.next_due,
        updated_at=case when public.relay_files.doc is distinct from excluded.doc then clock_timestamp() else public.relay_files.updated_at end;
  end if;
  if p_notify then
    select coalesce(array_agg(k::uuid),'{}'::uuid[]) into targets
      from jsonb_each(p_account->'devices') as d(k,v)
      where v->>'status'='approved' and (coalesce((v->'consent'->>'send')::boolean,false) or coalesce((v->'consent'->>'receive')::boolean,false));
    insert into public.relay_events(user_id,seq,file_id,kind,audience)
      values(p_user,seq_n,p_file_id,case when p_file is null then 'devices_changed' else 'file_changed' end,targets);
  end if;
  return jsonb_build_object('revision',seq_n::text);
end $$;

create function public.relay_events_page(p_user uuid,p_device uuid,p_after bigint,p_upto bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb; cursor_n bigint; more boolean; floor_n bigint;
begin
  select event_floor into strict floor_n from public.relay_accounts where user_id=p_user;
  if p_after<floor_n then return '{"error":"CURSOR_EXPIRED"}'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('cursor',seq::text,'file_id',file_id,'kind',kind) order by seq),'[]'::jsonb),max(seq)
    into items,cursor_n from (select * from public.relay_events where user_id=p_user and seq>p_after and seq<=p_upto and p_device=any(audience) order by seq limit 64) page;
  select exists(select 1 from public.relay_events where user_id=p_user and seq>coalesce(cursor_n,p_after) and seq<=p_upto and p_device=any(audience)) into more;
  return jsonb_build_object('events',items,'cursor',(case when more then cursor_n else greatest(p_after,p_upto) end)::text,'has_more',more);
end $$;

create function public.relay_snapshot_page(p_user uuid,p_device uuid,p_after text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb; last_id text; more boolean;
begin
  -- Blinded file records only. A receiver may discover offers; not file access grants.
  select coalesce(jsonb_agg(doc order by file_id),'[]'::jsonb),max(file_id) into items,last_id
    from (select file_id,doc from public.relay_files where user_id=p_user and file_id>p_after order by file_id limit 32) page;
  select exists(select 1 from public.relay_files where user_id=p_user and file_id>coalesce(last_id,p_after)) into more;
  return jsonb_build_object('items',items,'after',last_id,'has_more',more);
end $$;

create function public.relay_due() returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'file_id',file_id)),'[]'::jsonb)
  from (select user_id,file_id from public.relay_files where next_due<=floor(extract(epoch from clock_timestamp())*1000)::bigint order by next_due limit 16) jobs;
$$;
create function public.relay_sweep_cursor(p_cursor text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c text;
begin
  if p_cursor is not null then update public.relay_maintenance set sweep_cursor=p_cursor where id; end if;
  select sweep_cursor into c from public.relay_maintenance where id;
  return jsonb_build_object('cursor',c);
end $$;
create function public.relay_prune() returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; removed integer;
begin
  delete from public.relay_nonces where ctid in (select ctid from public.relay_nonces where expires_at<clock_timestamp() limit 10000);
  for r in select user_id,max(seq) as floor_n from public.relay_events where created_at<clock_timestamp()-interval '7 days' group by user_id limit 16 loop
    perform 1 from public.relay_accounts where user_id=r.user_id for update;
    delete from public.relay_events where user_id=r.user_id and seq<=r.floor_n;
    update public.relay_accounts set event_floor=greatest(event_floor,r.floor_n) where user_id=r.user_id;
  end loop;
  -- Only settled, non-active records; retry deduplication retention is 30 days.
  for r in select distinct user_id from public.relay_files where updated_at<clock_timestamp()-interval '30 days' and doc->>'state' in ('idle','deleted') limit 16 loop
    perform 1 from public.relay_accounts where user_id=r.user_id for update;
    delete from public.relay_files where user_id=r.user_id and updated_at<clock_timestamp()-interval '30 days'
      and doc->>'state' in ('idle','deleted') and (doc->>'reservedBytes')::bigint=0;
    get diagnostics removed=row_count;
    update public.relay_accounts set file_count=file_count-removed,revision=revision+1 where user_id=r.user_id;
  end loop;
  return '{"ok":true}';
end $$;

-- First DEV device: operator only, after checking the pending device fingerprint
-- through a trusted channel AND confirming local E2EE unlock/explicit relay opt-in.
-- Not a browser endpoint. Email authentication alone does not grant book access.
create function public.relay_bootstrap(p_user uuid,p_device uuid,p_public_key_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.relay_accounts%rowtype; d jsonb; n bigint;
begin
  select * into strict a from public.relay_accounts where user_id=p_user for update;
  if coalesce((a.data->>'everApproved')::boolean,false) then raise exception 'bootstrap already used'; end if;
  d:=a.data->'devices'->p_device::text; n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if d is null or d->>'status'<>'pending' or d->>'publicKeyHash'<>p_public_key_hash or (d->>'expiresAt')::bigint<=n then raise exception 'invalid pending device'; end if;
  d:=d||jsonb_build_object('status','approved','approvedAt',n);
  update public.relay_accounts set data=jsonb_set(jsonb_set(a.data,array['devices',p_device::text],d),'{everApproved}','true'),revision=revision+1 where user_id=p_user;
  return '{"ok":true}';
end $$;

revoke all on function public.relay_context(uuid,text),public.relay_commit(uuid,bigint,jsonb,text,jsonb,boolean,uuid,uuid),
 public.relay_events_page(uuid,uuid,bigint,bigint),public.relay_snapshot_page(uuid,uuid,text),public.relay_due(),
 public.relay_sweep_cursor(text),public.relay_prune(),public.relay_bootstrap(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.relay_context(uuid,text),public.relay_commit(uuid,bigint,jsonb,text,jsonb,boolean,uuid,uuid),
 public.relay_events_page(uuid,uuid,bigint,bigint),public.relay_snapshot_page(uuid,uuid,text),public.relay_due(),
 public.relay_sweep_cursor(text),public.relay_prune(),public.relay_bootstrap(uuid,uuid,text) to service_role;
commit;
