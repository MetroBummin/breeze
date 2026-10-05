-- Offline deployment proposal. Not an applied migration or scheduled job.
create table if not exists public.rss_public_catalog (
  id smallint primary key check (id = 1),
  payload jsonb not null default '{"version":1,"feeds":[]}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 200000),
  revision uuid,
  lease_token uuid,
  lease_until timestamptz not null default '-infinity',
  refresh_after timestamptz not null default '-infinity'
);
alter table public.rss_public_catalog enable row level security;
revoke all on public.rss_public_catalog from public, anon, authenticated;
grant select, update on public.rss_public_catalog to service_role;
insert into public.rss_public_catalog (id) values (1) on conflict do nothing;

create or replace function public.rss_catalog_claim(claim_token uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (
    update public.rss_public_catalog set lease_token = claim_token,
      lease_until = clock_timestamp() + interval '2 minutes',
      refresh_after = clock_timestamp() + interval '10 minutes'
    where id = 1 and lease_until <= clock_timestamp() and refresh_after <= clock_timestamp()
    returning id
  ) select exists(select 1 from claimed);
$$;
create or replace function public.rss_catalog_publish(claim_token uuid, new_payload jsonb)
returns boolean language sql security invoker set search_path = '' as $$
  with published as (
    update public.rss_public_catalog set payload = new_payload, revision = claim_token,
      lease_token = null, lease_until = '-infinity'
    where id = 1 and lease_token = claim_token and lease_until > clock_timestamp()
    returning id
  ) select exists(select 1 from published);
$$;
create or replace function public.rss_catalog_release(claim_token uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.rss_public_catalog set lease_token = null, lease_until = '-infinity'
  where id = 1 and lease_token = claim_token;
$$;
revoke all on function public.rss_catalog_claim(uuid), public.rss_catalog_publish(uuid,jsonb),
  public.rss_catalog_release(uuid) from public, anon, authenticated;
grant execute on function public.rss_catalog_claim(uuid), public.rss_catalog_publish(uuid,jsonb),
  public.rss_catalog_release(uuid) to service_role;
