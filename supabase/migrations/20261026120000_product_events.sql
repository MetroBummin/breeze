-- First-party product events. Anonymous and signed-in clients may insert
-- only. They cannot read, update, or delete. Prefer: return=minimal on the
-- client; there is no SELECT grant, so a representation request cannot return
-- the row.
--
-- Abuse caps, chosen because they are one indexed count and one counter-row
-- update (no extra service, no polling):
--   * 48 events / device / rolling 24h. One onboarding pass is about 15 rows,
--     so a reader can replay the guide the same day and still record the
--     first-tap / lookup / save milestones.
--   * 4,000 events / Asia/Seoul day for the whole table. Steady use stays far
--     under this. The ceiling, held for 90 days, is about 180MB, inside the
--     free-plan database budget even if it is hit every day.
--
-- Retention uses pg_cron, already installed on this free-plan project. A
-- daily job deletes rows older than 90 days in small batches and also prunes
-- this job's own cron.job_run_details so that history table does not grow.

create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists events_private;
revoke all on schema events_private from public, anon, authenticated, service_role;

create table if not exists events_private.daily_totals (
  day date primary key,
  n integer not null
);
revoke all on events_private.daily_totals from public, anon, authenticated, service_role;

-- Owner addresses stay out of the repository. Seed this table in the database
-- after applying the migration. The analysis view drops matching accounts.
create table if not exists events_private.excluded_emails (
  email text primary key,
  constraint excluded_emails_chk check (email = lower(email) and length(email) between 3 and 320)
);
revoke all on events_private.excluded_emails from public, anon, authenticated;
grant select on events_private.excluded_emails to service_role;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  device_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  app_version text not null,
  platform text not null,
  onboarding_version text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  props jsonb not null default '{}'::jsonb,
  constraint product_events_name_chk check (name in (
    'app_open','onboarding_start','onboarding_step_complete','onboarding_step_skip',
    'onboarding_choice','first_word_tap','first_lookup_success','vocab_save'
  )),
  constraint product_events_device_chk check (device_id ~ '^[A-Za-z0-9-]{8,64}$'),
  constraint product_events_version_chk check (app_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint product_events_platform_chk check (platform in ('web','ios','android')),
  constraint product_events_onboarding_chk check (onboarding_version ~ '^[a-z0-9]{1,8}$'),
  constraint product_events_utm_source_chk check (utm_source is null or utm_source ~ '^[A-Za-z0-9._~-]{1,64}$'),
  constraint product_events_utm_medium_chk check (utm_medium is null or utm_medium ~ '^[A-Za-z0-9._~-]{1,64}$'),
  constraint product_events_utm_campaign_chk check (utm_campaign is null or utm_campaign ~ '^[A-Za-z0-9._~-]{1,64}$'),
  constraint product_events_utm_content_chk check (utm_content is null or utm_content ~ '^[A-Za-z0-9._~-]{1,64}$'),
  constraint product_events_props_chk check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 200)
);

create index if not exists product_events_created_idx on public.product_events (created_at);
create index if not exists product_events_device_created_idx on public.product_events (device_id, created_at);

create or replace function events_private.clean_props(event_name text, raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  step text;
  choice text;
  ms_text text;
  ms integer;
begin
  if raw is null or jsonb_typeof(raw) <> 'object' then
    raw := '{}'::jsonb;
  end if;
  if octet_length(raw::text) > 400 then
    raise exception 'event props too large' using errcode = '22023';
  end if;
  if event_name = 'onboarding_start' then
    return jsonb_build_object('replay', raw->>'replay' = 'true');
  elsif event_name in ('onboarding_step_complete','onboarding_step_skip') then
    step := left(coalesce(raw->>'step',''), 24);
    if step !~ '^[a-z0-9_-]{1,24}$' then
      raise exception 'event step' using errcode = '22023';
    end if;
    ms_text := raw->>'ms';
    if ms_text is null or ms_text !~ '^[0-9]{1,8}$' then
      ms := 0;
    else
      ms := least(3600000, greatest(0, ms_text::integer));
    end if;
    return jsonb_build_object('step', step, 'ms', ms);
  elsif event_name = 'onboarding_choice' then
    choice := left(coalesce(raw->>'choice',''), 24);
    if choice !~ '^[a-z0-9_-]{1,24}$' then
      raise exception 'event choice' using errcode = '22023';
    end if;
    return jsonb_build_object('choice', choice);
  elsif event_name = 'vocab_save' then
    return jsonb_build_object('first', raw->>'first' is null or raw->>'first' = 'true');
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function events_private.guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  device_n integer;
  total_n integer;
begin
  -- Ignore any client-supplied owner or clock. auth.uid() is null for anon.
  new.user_id := auth.uid();
  new.created_at := now();
  new.props := events_private.clean_props(new.name, new.props);

  select count(*) into device_n
  from public.product_events
  where device_id = new.device_id
    and created_at > now() - interval '1 day';
  if device_n >= 48 then
    raise exception 'event cap' using errcode = 'P0001';
  end if;

  insert into events_private.daily_totals as totals(day, n) values (today, 1)
  on conflict (day) do update set n = totals.n + 1
  where totals.n < 4000
  returning totals.n into total_n;
  if total_n is null then
    raise exception 'event cap' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists product_events_guard on public.product_events;
create trigger product_events_guard
  before insert on public.product_events
  for each row execute function events_private.guard();

revoke all on function events_private.clean_props(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function events_private.guard() from public, anon, authenticated, service_role;
grant usage on schema events_private to anon, authenticated;
grant execute on function events_private.guard() to anon, authenticated;

alter table public.product_events enable row level security;
revoke all on public.product_events from public, anon, authenticated;
grant insert on public.product_events to anon, authenticated;
grant select, delete on public.product_events to service_role;

drop policy if exists product_events_insert on public.product_events;
create policy product_events_insert
  on public.product_events
  for insert
  to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

-- Analysis view. security_invoker so a role without SELECT on the table
-- learns nothing. Owner accounts and the known device are left out.
create or replace view public.product_events_analysis
with (security_invoker = true) as
select e.id, e.created_at, e.name, e.device_id, e.user_id, e.app_version,
       e.platform, e.onboarding_version, e.utm_source, e.utm_medium,
       e.utm_campaign, e.utm_content, e.props
from public.product_events e
where lower(e.device_id) not like '8a1d89eb%'
  and not exists (
    select 1 from auth.users u
    where u.id = e.user_id
      and (
        lower(u.email) in (select email from events_private.excluded_emails)
        or lower(u.email) like 'f3553df5%'
      )
  )
  and not exists (
    select 1 from auth.identities i
    where i.user_id = e.user_id
      and (
        coalesce(i.provider_id, '') ilike 'f3553df5%'
        or coalesce(i.identity_data->>'sub', '') ilike 'f3553df5%'
        or coalesce(i.identity_data->>'email', '') ilike 'f3553df5%'
      )
  );

revoke all on public.product_events_analysis from public, anon, authenticated;
grant select on public.product_events_analysis to service_role;

create or replace function events_private.purge_old()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer := 0;
  batch integer;
begin
  perform set_config('statement_timeout', '20s', true);
  loop
    delete from public.product_events
    where id in (
      select id from public.product_events
      where created_at < now() - interval '90 days'
      order by created_at
      limit 5000
    );
    get diagnostics batch = row_count;
    removed := removed + batch;
    exit when batch = 0 or removed >= 40000;
  end loop;
  delete from events_private.daily_totals
  where day < ((now() at time zone 'Asia/Seoul')::date - 90);
  delete from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'product-events-retention')
    and start_time < now() - interval '14 days';
end;
$$;

revoke all on function events_private.purge_old() from public, anon, authenticated, service_role;

select cron.schedule(
  'product-events-retention',
  '20 18 * * *',
  'select events_private.purge_old()'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'product-events-retention'),
  active := true
);

notify pgrst, 'reload schema';
