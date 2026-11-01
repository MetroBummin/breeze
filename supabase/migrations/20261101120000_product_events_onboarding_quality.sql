-- Onboarding measurement. Additive only: this does not edit
-- 20261026054149_product_events.sql. It does not change the insert trigger
-- (events_private.guard still sets user_id from auth.uid()) or the
-- insert-only policy. anon and authenticated still cannot select.
--
-- Apply this before deploying the client that sends the new event names and
-- the browser / in_app columns. The client retries a missing column and a
-- rejected event name so an early deploy does not drop the older events.
-- Do not apply it from the app repository's tooling; it waits for the owner.

-- f3553df5 is a user id prefix. The previous analysis view compared it to
-- email and identity fields, so the owner's other devices stayed in the
-- funnel. Devices that have ever sent a row for that account are test
-- devices too, including rows where user_id is null. Prefixes in
-- events_private.test_devices are an explicit flag the owner can extend
-- without another migration.

create table if not exists events_private.test_devices (
  prefix text primary key,
  constraint test_devices_prefix_chk check (prefix = lower(prefix) and prefix ~ '^[a-z0-9]{8,64}$')
);
revoke all on events_private.test_devices from public, anon, authenticated;
grant select on events_private.test_devices to service_role;

insert into events_private.test_devices(prefix) values
  ('8a1d89eb'),
  ('d1b96fd8'),
  ('996df2bd')
on conflict do nothing;

alter table public.product_events add column if not exists browser text;
alter table public.product_events add column if not exists in_app text;

alter table public.product_events drop constraint if exists product_events_name_chk;
alter table public.product_events add constraint product_events_name_chk check (name in (
  'app_open','onboarding_start','onboarding_step_complete','onboarding_step_skip',
  'onboarding_choice','first_word_tap','first_lookup_success','vocab_save',
  'onboarding_closed','onboarding_intro_play','onboarding_word_pill','landing_view'
));

alter table public.product_events drop constraint if exists product_events_browser_chk;
alter table public.product_events add constraint product_events_browser_chk
  check (browser is null or browser in ('chrome','safari','firefox','edge','samsung','opera','other'));

alter table public.product_events drop constraint if exists product_events_in_app_chk;
alter table public.product_events add constraint product_events_in_app_chk
  check (in_app is null or in_app in ('kakao','instagram','naver'));

create or replace function events_private.clean_props(event_name text, raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  step text;
  choice text;
  reason text;
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
  elsif event_name = 'onboarding_closed' then
    step := left(coalesce(raw->>'step',''), 24);
    if step !~ '^[a-z0-9_-]{1,24}$' then
      raise exception 'event step' using errcode = '22023';
    end if;
    reason := left(coalesce(raw->>'reason',''), 24);
    if reason !~ '^(esc|back|hidden|pagehide|dismiss)$' then
      raise exception 'event reason' using errcode = '22023';
    end if;
    ms_text := raw->>'ms';
    if ms_text is null or ms_text !~ '^[0-9]{1,8}$' then
      ms := 0;
    else
      ms := least(3600000, greatest(0, ms_text::integer));
    end if;
    return jsonb_build_object('step', step, 'ms', ms, 'reason', reason);
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

revoke all on function events_private.clean_props(text, jsonb) from public, anon, authenticated, service_role;

-- product_events_labeled keeps every row and sets is_test_device. The
-- analysis view used by the funnel is that set with test rows removed, so
-- saved queries that read product_events_analysis stay owner-free.
drop view if exists public.product_events_analysis;
drop view if exists public.product_events_labeled;

create view public.product_events_labeled
with (security_invoker = true) as
with owners as (
  select u.id
  from auth.users u
  where lower(u.id::text) like 'f3553df5%'
     or lower(u.email) in (select email from events_private.excluded_emails)
),
owner_devices as (
  select distinct pe.device_id
  from public.product_events pe
  where pe.user_id in (select id from owners)
)
select e.id, e.created_at, e.name, e.device_id, e.user_id, e.app_version,
       e.platform, e.onboarding_version, e.utm_source, e.utm_medium,
       e.utm_campaign, e.utm_content, e.props, e.referrer, e.browser, e.in_app,
       (
         (e.user_id is not null and e.user_id in (select id from owners))
         or e.device_id in (select device_id from owner_devices)
         or exists (
           select 1 from events_private.test_devices t
           where lower(e.device_id) like t.prefix || '%'
         )
       ) as is_test_device
from public.product_events e;

create view public.product_events_analysis
with (security_invoker = true) as
select id, created_at, name, device_id, user_id, app_version, platform,
       onboarding_version, utm_source, utm_medium, utm_campaign, utm_content,
       props, referrer, browser, in_app
from public.product_events_labeled
where not is_test_device;

revoke all on public.product_events_labeled from public, anon, authenticated;
grant select on public.product_events_labeled to service_role;
revoke all on public.product_events_analysis from public, anon, authenticated;
grant select on public.product_events_analysis to service_role;

notify pgrst, 'reload schema';
