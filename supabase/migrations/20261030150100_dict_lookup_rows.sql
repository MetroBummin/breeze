-- Issue #316, part 2. One dict_events row per word or sentence lookup the
-- dict function answered, with lookup_type 'word' or 'sentence'. Apply before
-- deploying the dict function that calls record_dict_lookup; until then the
-- call fails, is logged as lookup_metric_write_failed, and the lookup itself
-- still succeeds. The per-attempt provider rows (telemetry_version 2) are
-- unchanged. No headword, sentence, or answer is stored.

-- ── 2) dict_events lookup rows ───────────────────────────────────────────
alter table public.dict_events
  add column if not exists lookup_type text;
alter table public.dict_events
  drop constraint if exists dict_events_lookup_type_chk;
alter table public.dict_events
  add constraint dict_events_lookup_type_chk check (lookup_type is null or lookup_type in ('word','sentence'));

-- A retried logical lookup (same lookupId) updates its one row.
create unique index if not exists dict_events_lookup_request
  on public.dict_events ((meta->>'request_id'))
  where meta->>'telemetry_version' = '3';
create index if not exists dict_events_lookup_type_idx
  on public.dict_events (lookup_type, at desc)
  where lookup_type is not null;

create or replace function public.record_dict_lookup(
  p_request_id uuid, p_user uuid, p_lookup_type text, p_action text,
  p_outcome text, p_provider text, p_duration_ms integer
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
  v_user uuid;
begin
  if p_request_id is null
     or p_lookup_type is null or p_lookup_type not in ('word','sentence')
     or p_action is null
     or (p_lookup_type = 'word' and p_action not in ('look','retry'))
     or (p_lookup_type = 'sentence' and p_action <> 'explain')
     or p_outcome is null or p_outcome not in (
       'ok','replay','failed','timeout','quota_exceeded','anon_exhausted',
       'login_required','request_conflict','quota_unavailable')
     or (p_provider is not null and p_provider not in ('openrouter','gemini'))
     or p_duration_ms is null or p_duration_ms not between 0 and 3600000
  then
    raise exception 'invalid lookup fields' using errcode = '22023';
  end if;

  -- A deleted or unknown account is recorded as anonymous instead of failing the FK.
  select u.id into v_user from auth.users u where u.id = p_user;

  insert into public.dict_events as d(user_id, action, word, provider, lookup_type, meta)
  values (
    v_user, p_action, '', p_provider, p_lookup_type,
    jsonb_build_object(
      'telemetry_version', 3,
      'request_id', p_request_id,
      'lookup_type', p_lookup_type,
      'outcome', p_outcome,
      'duration_ms', p_duration_ms,
      'signed_in', v_user is not null
    )
  )
  on conflict ((meta->>'request_id'))
    where meta->>'telemetry_version' = '3'
  do update set
    at = now(),
    action = excluded.action,
    provider = excluded.provider,
    lookup_type = excluded.lookup_type,
    meta = excluded.meta
  -- Another account cannot overwrite a row by reusing its lookupId.
  where d.user_id is not distinct from excluded.user_id
  returning d.id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.record_dict_lookup(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_dict_lookup(uuid, uuid, text, text, text, text, integer) to service_role;

notify pgrst, 'reload schema';
