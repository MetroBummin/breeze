-- NOT EXECUTED HERE. Run after migration only in an explicitly approved TEST DB.
-- Read-only assertions: no books, auth users, existing schema, or data are modified.
begin;
do $$
declare t text; f text; enabled boolean;
begin
  foreach t in array array['relay_accounts','relay_files','relay_events','relay_nonces','relay_maintenance'] loop
    select c.relrowsecurity into enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t;
    if enabled is distinct from true then raise exception 'RLS missing: %',t; end if;
    if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Browser table grant: %',t;
    end if;
    if exists(select 1 from pg_policies where schemaname='public' and tablename=t) then
      raise exception 'Unexpected browser policy: %',t;
    end if;
  end loop;
  foreach f in array array['relay_context(uuid,text)','relay_commit(uuid,bigint,jsonb,text,jsonb,boolean,uuid,uuid)',
    'relay_events_page(uuid,uuid,bigint,bigint)','relay_snapshot_page(uuid,uuid,text)','relay_due()',
    'relay_sweep_cursor(text)','relay_prune()','relay_bootstrap(uuid,uuid,text)'] loop
    if has_function_privilege('anon','public.'||f,'EXECUTE')
       or has_function_privilege('authenticated','public.'||f,'EXECUTE') then raise exception 'Browser RPC grant: %',f; end if;
    if not has_function_privilege('service_role','public.'||f,'EXECUTE') then raise exception 'Worker RPC denied: %',f; end if;
  end loop;
end $$;
rollback;
-- Also run real PostgREST tests for another user, unauthorized device, stale CAS,
-- concurrent senders/final ACK vs new recipient and quota races after setting up
-- disposable test accounts. The in-memory tests are not PostgreSQL execution.
