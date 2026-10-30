-- Funnel for the current onboarding. Run in the SQL editor as postgres.
-- anon/authenticated cannot read product_events or this view.
-- The view drops device ids starting 8a1d89eb and the Apple relay prefix f3553df5.
-- Owner emails are rows in events_private.excluded_emails, seeded in the database
-- and not stored in this repository.
-- Replay starts are not counted as new starts. vocab_save is first-save only.

select onboarding_version,
       coalesce(utm_source, '(none)') as utm_source,
       coalesce(utm_medium, '(none)') as utm_medium,
       coalesce(utm_campaign, '(none)') as utm_campaign,
       coalesce(utm_content, '(none)') as utm_content,
       count(distinct device_id) filter (
         where name = 'onboarding_start' and props->>'replay' = 'false'
       ) as starts,
       count(distinct device_id) filter (where name = 'first_word_tap') as word_taps,
       count(distinct device_id) filter (where name = 'first_lookup_success') as lookups,
       count(distinct device_id) filter (
         where name = 'vocab_save' and props->>'first' = 'true'
       ) as saves
from public.product_events_analysis
group by 1, 2, 3, 4, 5
order by starts desc, word_taps desc;

-- First-touch referrer host (no path). Landing forwards it to the app as ref_host.
select coalesce(referrer_host, '(none)') as referrer_host,
       coalesce(utm_source, '(none)') as utm_source,
       count(distinct device_id) filter (where name = 'app_open') as devices,
       count(distinct device_id) filter (
         where name = 'onboarding_start' and props->>'replay' = 'false'
       ) as starts
from public.product_events_analysis
where created_at > now() - interval '30 days'
group by 1, 2
order by devices desc;

-- Join anonymous device events to the account that later signed in on the
-- same device. Any row with both ids links the device.
with device_user as (
  select device_id, (array_agg(user_id order by created_at desc))[1] as user_id
  from public.product_events_analysis
  where user_id is not null
  group by device_id
)
select e.name, count(*) as events, count(d.user_id) as linked_to_user
from public.product_events_analysis e
left join device_user d using (device_id)
group by 1
order by 2 desc;

-- Word vs sentence lookups per Seoul day (dict_events telemetry_version 3).
select (at at time zone 'Asia/Seoul')::date as day, lookup_type,
       count(*) as lookups,
       count(*) filter (where meta->>'outcome' in ('ok','replay')) as answered,
       count(distinct user_id) as signed_in_users,
       round(avg((meta->>'duration_ms')::int)) as avg_ms
from public.dict_events
where meta->>'telemetry_version' = '3'
group by 1, 2
order by 1 desc, 2;
