-- Funnel for the current onboarding. Run in the SQL editor as postgres.
-- anon/authenticated cannot read product_events or these views.
-- product_events_analysis drops test traffic. product_events_labeled keeps
-- every row and sets is_test_device, for checking that the exclusion worked.
-- A row is test traffic when its user_id starts with f3553df5 (that prefix is
-- a user id, not an email), when the account email is in
-- events_private.excluded_emails, when the device was ever used by one of
-- those accounts, or when the device id matches events_private.test_devices
-- (seeded with 8a1d89eb, d1b96fd8, 996df2bd).
-- Replay starts are not counted as new starts. vocab_save is first-save only.
-- onboarding_closed can fire on visibility hidden and still be followed by a
-- later choice if the reader comes back. Treat hidden as a leave signal, and
-- use the absence of a later choice when you want a final exit.

select onboarding_version,
       coalesce(utm_source, '(none)') as utm_source,
       coalesce(utm_medium, '(none)') as utm_medium,
       coalesce(utm_campaign, '(none)') as utm_campaign,
       coalesce(utm_content, '(none)') as utm_content,
       coalesce(browser, '(none)') as browser,
       coalesce(in_app, '(none)') as in_app,
       count(distinct device_id) filter (
         where name = 'onboarding_start' and props->>'replay' = 'false'
       ) as starts,
       count(distinct device_id) filter (where name = 'onboarding_intro_play') as intro_plays,
       count(distinct device_id) filter (where name = 'onboarding_word_pill') as word_pills,
       count(distinct device_id) filter (where name = 'onboarding_closed') as closes,
       count(distinct device_id) filter (where name = 'first_word_tap') as word_taps,
       count(distinct device_id) filter (where name = 'first_lookup_success') as lookups,
       count(distinct device_id) filter (
         where name = 'vocab_save' and props->>'first' = 'true'
       ) as saves
from public.product_events_analysis
group by 1, 2, 3, 4, 5, 6, 7
order by starts desc, word_taps desc;

-- Where a session left the guide. One row per device per session is not
-- available; this is one row per device, using that device's close reasons.
select props->>'step' as step,
       props->>'reason' as reason,
       count(*) as closes,
       count(distinct device_id) as devices
from public.product_events_analysis
where name = 'onboarding_closed'
group by 1, 2
order by devices desc, closes desc;
