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
