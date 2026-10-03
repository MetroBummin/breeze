-- Shared public RSS decisions only. No user imports or article bodies.
-- CLI scaffolding unavailable in the read-only-home build environment; not applied remotely.
create table public.rss_quality_feeds (
  id smallint primary key check (id between 0 and 12),
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) <= 20),
  cursor integer not null default 0 check (cursor >= 0),
  token uuid,
  next_run timestamptz not null default '-infinity'
);
insert into public.rss_quality_feeds(id) select generate_series(0,12);

create table public.rss_article_quality (
  cache_key text primary key check (cache_key ~ '^[a-f0-9]{64}$'),
  source_url text not null check (length(source_url) <= 4096),
  version text not null,
  model text not null,
  rubric text not null,
  status text not null check (status in ('pending','approved','rejected','uncertain','unavailable','retry')),
  verdict jsonb,
  token uuid not null,
  lease_until timestamptz,
  retry_at timestamptz not null,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  check (status not in ('approved','rejected','uncertain','unavailable') or
    (verdict is not null and verdict->>'status' = status and verdict->>'version' = version) is true)
);
create index rss_quality_active_leases on public.rss_article_quality(lease_until) where status = 'pending';
create table public.rss_quality_budget (
  day date primary key,
  calls integer not null check (calls between 0 and 200)
);
alter table public.rss_quality_feeds enable row level security;
alter table public.rss_article_quality enable row level security;
alter table public.rss_quality_budget enable row level security;
revoke all on public.rss_quality_feeds, public.rss_article_quality, public.rss_quality_budget from public, anon, authenticated;
grant select, insert, update, delete on public.rss_quality_feeds, public.rss_article_quality, public.rss_quality_budget to service_role;

-- Service role only; SECURITY INVOKER deliberately preserves privilege checks.
-- One transaction claims a content/version key, one of four global slots and
-- one of 200 daily attempts. Readers cannot select work or override the budget.
create function public.claim_rss_quality(p_key text, p_url text, p_version text, p_model text, p_rubric text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.rss_article_quality%rowtype;
  claimed_token uuid;
  today date := (now() at time zone 'UTC')::date;
  spent integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or length(p_url) > 4096 then raise exception 'invalid quality identity'; end if;
  perform pg_advisory_xact_lock(92304112);
  select * into existing from public.rss_article_quality where cache_key = p_key;
  if found then
    if existing.version <> p_version or existing.source_url <> p_url or existing.model <> p_model or existing.rubric <> p_rubric then
      raise exception 'quality identity conflict';
    end if;
    if existing.status in ('approved','rejected') then
      return jsonb_build_object('verdict',existing.verdict);
    end if;
    if existing.status in ('uncertain','unavailable') and (existing.retry_at > now() or existing.attempts >= 3) then
      return jsonb_build_object('verdict',existing.verdict);
    end if;
    if existing.attempts >= 3 or existing.retry_at > now() or existing.lease_until > now() then return '{}'::jsonb; end if;
  end if;
  if (select count(*) from public.rss_article_quality where status = 'pending' and lease_until > now()) >= 4 then return '{}'::jsonb; end if;
  insert into public.rss_quality_budget(day,calls) values(today,0) on conflict do nothing;
  select calls into spent from public.rss_quality_budget where day = today;
  if spent >= 200 then return '{}'::jsonb; end if;
  update public.rss_quality_budget set calls = calls + 1 where day = today;
  claimed_token := gen_random_uuid();
  insert into public.rss_article_quality(cache_key,source_url,version,model,rubric,status,token,lease_until,retry_at)
    values(p_key,p_url,p_version,p_model,p_rubric,'pending',claimed_token,now()+interval '90 seconds',now()+interval '90 seconds')
    on conflict(cache_key) do update set status='pending',token=claimed_token,
      lease_until=now()+interval '90 seconds',retry_at=now()+interval '90 seconds',attempts=public.rss_article_quality.attempts+1;
  return jsonb_build_object('token',claimed_token);
end;
$$;
revoke all on function public.claim_rss_quality(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_rss_quality(text,text,text,text,text) to service_role;
