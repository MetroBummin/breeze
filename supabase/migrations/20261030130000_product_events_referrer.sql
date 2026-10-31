-- First-touch acquisition on product_events gained a sanitized referrer. The
-- client (scripts/core/events.js) captures document.referrer once, reduced to a
-- short scheme+host origin, alongside the existing utm_* first-touch values.
-- This migration adds the matching column additively. It does NOT edit the
-- historic 20261026054149_product_events.sql file, and it leaves the insert
-- trigger (events_private.guard sets new.user_id := auth.uid()) and the
-- insert-only RLS policy untouched: user_id is already populated server-side
-- whenever the request carries the signed-in JWT.
alter table public.product_events add column if not exists referrer text;

-- Sanitizing CHECK mirrors the client: a short origin/host form only, no query
-- or path that could carry PII, capped at 128 chars. ADD CONSTRAINT has no
-- IF NOT EXISTS, so guard it against re-runs via pg_constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_events_referrer_chk'
      and conrelid = 'public.product_events'::regclass
  ) then
    alter table public.product_events
      add constraint product_events_referrer_chk
      check (referrer is null or referrer ~ '^[A-Za-z0-9._:/~-]{1,128}$');
  end if;
end
$$;

notify pgrst, 'reload schema';
