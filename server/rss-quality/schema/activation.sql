-- Apply once AFTER rss_readiness_shared_cache. Service-only rollout controls.
create table public.rss_quality_control (
  id boolean primary key default true check(id),
  mode text not null default 'off' check(mode in ('off','shadow','active')),
  evaluation_until timestamptz
);
insert into public.rss_quality_control(id) values(true);
create table public.rss_quality_eval (
  id text primary key check(id ~ '^RSS-[0-9]{3}$'),
  status text not null default 'queued' check(status in ('queued','running','done')),
  token uuid,
  result jsonb
);
-- Immutable 106 work slots, one claim per slot. Crashed slots are never reclaimed.
insert into public.rss_quality_eval(id) select 'RSS-'||lpad(n::text,3,'0') from generate_series(1,106) n;
alter table public.rss_quality_control enable row level security;
alter table public.rss_quality_eval enable row level security;
revoke all on public.rss_quality_control,public.rss_quality_eval from public,anon,authenticated;
grant select,insert,update,delete on public.rss_quality_control,public.rss_quality_eval to service_role;
create function public.claim_rss_eval(p_id text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare claimed uuid;
begin
  perform pg_advisory_xact_lock(92304113);
  if not exists(select 1 from public.rss_quality_control where mode='shadow' and evaluation_until>now()) then return null; end if;
  if (select count(*) from public.rss_quality_eval where status='running')>=2 then return null; end if;
  update public.rss_quality_eval set status='running',token=gen_random_uuid()
    where id=p_id and status='queued' returning token into claimed;
  return claimed;
end; $$;
revoke all on function public.claim_rss_eval(text) from public,anon,authenticated;
grant execute on function public.claim_rss_eval(text) to service_role;
create table public.rss_quality_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  mode text not null check(mode in ('shadow','active')),
  stage text not null, code text not null, detail text, field text,
  feed smallint check(feed between 0 and 12),
  cache_key text check(cache_key ~ '^[a-f0-9]{64}$'),
  input_tokens bigint check(input_tokens>=0), output_tokens bigint check(output_tokens>=0)
);
alter table public.rss_quality_events enable row level security;
revoke all on public.rss_quality_events from public,anon,authenticated;
revoke all on sequence public.rss_quality_events_id_seq from public,anon,authenticated;
grant select,insert,delete on public.rss_quality_events to service_role;
grant usage on sequence public.rss_quality_events_id_seq to service_role;
