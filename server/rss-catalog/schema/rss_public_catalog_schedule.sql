-- Separate parent-owned setup, on hrtfhojbhqvaoiulspto only. Never put a key in
-- this file, cron command, query result or logs. The existing service credential
-- must already be stored by the owner in Vault as rss_catalog_service_role.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
revoke usage on schema cron from public, anon, authenticated, service_role;

-- pg_net's queue can contain authorization headers. A new extension must not
-- expose that queue or a privileged HTTP enqueue API to public Data API roles.
revoke usage on schema net from public, anon, authenticated, service_role;
revoke all on all tables in schema net from public, anon, authenticated, service_role;
revoke all on all sequences in schema net from public, anon, authenticated, service_role;
revoke execute on all functions in schema net from public, anon, authenticated, service_role;
-- Keep the cron owner able to enqueue even if the extension's objects are
-- owned by a managed platform role rather than postgres.
grant usage on schema net to postgres;
grant all on all tables in schema net to postgres;
grant all on all sequences in schema net to postgres;
grant execute on all functions in schema net to postgres;

create schema if not exists rss_catalog_private;
revoke all on schema rss_catalog_private from public, anon, authenticated, service_role;
create or replace function rss_catalog_private.enqueue_refresh()
returns bigint language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.rss_public_catalog where id=1 and active)
    then return null; end if;
  if not exists(select 1 from vault.secrets where name='rss_catalog_service_role')
    then raise exception 'catalog refresh credential is not configured'; end if;
  return net.http_post(
    url := 'https://hrtfhojbhqvaoiulspto.supabase.co/functions/v1/rss-catalog',
    headers := jsonb_build_object('Content-Type','application/json','apikey',
      (select decrypted_secret from vault.decrypted_secrets where name='rss_catalog_service_role')),
    body := null::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function rss_catalog_private.enqueue_refresh() from public, anon, authenticated, service_role;
-- Installation remains inert. Parent warms and checks the catalog before
-- explicitly enabling this postgres-owned job. The endpoint has its own fence.
select cron.schedule('breeze-rss-catalog-refresh','*/10 * * * *',
  'select rss_catalog_private.enqueue_refresh();');
update cron.job set active=false where jobname='breeze-rss-catalog-refresh';
commit;
