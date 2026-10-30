-- Issue #316, part 1. product_events.referrer_host: the first-touch external
-- referrer, host name only (no path, no query). It follows the same
-- first-touch rule as the utm_* columns. The web client works before this is
-- applied: a 400 makes it resend the batch without that key.

-- ── 1) product_events.referrer_host ──────────────────────────────────────
alter table public.product_events
  add column if not exists referrer_host text;
alter table public.product_events
  drop constraint if exists product_events_referrer_host_chk;
alter table public.product_events
  add constraint product_events_referrer_host_chk check (
    referrer_host is null
    or (length(referrer_host) between 3 and 253
        and referrer_host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  );

-- Same view, one column appended (create or replace may only add at the end).
create or replace view public.product_events_analysis
with (security_invoker = true) as
select e.id, e.created_at, e.name, e.device_id, e.user_id, e.app_version,
       e.platform, e.onboarding_version, e.utm_source, e.utm_medium,
       e.utm_campaign, e.utm_content, e.props, e.referrer_host
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

notify pgrst, 'reload schema';
