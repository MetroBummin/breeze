-- record_dict_ai_usage inserts with
--   on conflict ((meta->>'request_id'),(meta->>'attempt'))
--     where meta->>'telemetry_version' = '2'
-- which Postgres can only infer against a matching partial UNIQUE index. That
-- index was never created by any migration: it only existed inline inside
-- tests/verify-dict-telemetry.mjs, so on live Supabase every call raised
-- SQLSTATE 42P10 and the insert failed. telemetry.ts persist() swallows that as
-- 'ai_metric_write_failed', so lookups still succeeded while public.dict_events
-- gained 0 rows. The ON CONFLICT clause first shipped in
-- 20261017130155_dict_ai_timeout_outcome.sql. This migration is the additive
-- fix: create the missing index so the insert resolves the conflict target.
create unique index if not exists dict_events_telemetry_request_attempt
  on public.dict_events ((meta->>'request_id'), (meta->>'attempt'))
  where meta->>'telemetry_version' = '2';

-- Add an explicit word-vs-sentence split to dict telemetry. The edge function
-- keeps its existing action vocabulary; lookup_type is derived here from
-- p_action so word ('look'/'retry'/'seed') and sentence ('explain') lookups are
-- queryable without the endpoint writing dict_events directly. Based on the
-- latest body (20261021193000_dict_lookup_reject_meta.sql) so hedge / winner /
-- loser / reject_reason / downgraded / ai_usage handling is preserved; only the
-- lookup_type key is added to the inserted meta.
create or replace function public.record_dict_ai_usage(p_request_id uuid, p_attempt integer, p_action text, p_provider text, p_model text, p_http_status integer, p_duration_ms integer, p_outcome text, p_usage jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint;
  v_usage jsonb;
  v_key text;
  v_value jsonb;
  v_hedged jsonb;
  v_winner text;
  v_loser text;
  v_reason text;
  v_downgraded jsonb;
  v_lookup_type text;
begin
  if p_request_id is null or p_attempt is null or p_attempt not between 1 and 20
     or p_action is null or p_action not in ('look','retry','explain','seed','judge','phrase','route','repair')
     or p_provider is null or p_provider not in ('openrouter','gemini','claude','jev')
     or p_model is null or p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
     or p_duration_ms is null or p_duration_ms not between 0 and 3600000
     or p_outcome is null or p_outcome not in ('api_ok','api_error','network_error','timeout')
     or (p_http_status is not null and p_http_status not between 100 and 599)
  then
    raise exception 'invalid metric fields' using errcode = '22023';
  end if;

  v_lookup_type := case when p_action in ('look','retry','seed') then 'word'
                        when p_action = 'explain' then 'sentence' end;

  if p_usage is not null and p_usage <> 'null'::jsonb then
    if jsonb_typeof(p_usage) <> 'object' then
      raise exception 'invalid usage object' using errcode = '22023';
    end if;
    if p_usage ? 'hedged' then
      if jsonb_typeof(p_usage->'hedged') <> 'boolean' then
        raise exception 'invalid hedge' using errcode = '22023';
      end if;
      v_hedged := p_usage->'hedged';
    end if;
    if p_usage ? 'winner' and jsonb_typeof(p_usage->'winner') <> 'null' then
      v_winner := p_usage->>'winner';
      if v_winner not in ('openrouter','gemini') then
        raise exception 'invalid hedge' using errcode = '22023';
      end if;
    end if;
    if p_usage ? 'loser' and jsonb_typeof(p_usage->'loser') <> 'null' then
      v_loser := p_usage->>'loser';
      if v_loser not in ('aborted','failed','late') then
        raise exception 'invalid hedge' using errcode = '22023';
      end if;
    end if;
    if p_usage ? 'reject_reason' and jsonb_typeof(p_usage->'reject_reason') <> 'null' then
      v_reason := p_usage->>'reject_reason';
      if v_reason !~ '^[a-z][a-z0-9_]{0,39}$' then
        raise exception 'invalid reject reason' using errcode = '22023';
      end if;
    end if;
    if p_usage ? 'downgraded' then
      if p_usage->'downgraded' <> 'true'::jsonb then
        raise exception 'invalid downgrade' using errcode = '22023';
      end if;
      v_downgraded := 'true'::jsonb;
    end if;
    p_usage := p_usage - 'hedged' - 'winner' - 'loser' - 'reject_reason' - 'downgraded';
    if p_usage = '{}'::jsonb then
      p_usage := null;
    end if;
  end if;

  if p_usage is not null and p_usage <> 'null'::jsonb then
    v_usage := jsonb_build_object('model',p_model);
    foreach v_key in array array[
      'input_tokens','output_tokens','thinking_tokens','total_tokens',
      'cached_input_tokens','cache_creation_input_tokens','tool_input_tokens'
    ] loop
      v_value := p_usage->v_key;
      if v_value is not null and v_value <> 'null'::jsonb then
        if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]{1,12}$' then
          raise exception 'invalid token count' using errcode = '22023';
        end if;
      end if;
      v_usage := v_usage || jsonb_build_object(v_key,v_value);
    end loop;
  end if;

  insert into public.dict_events(user_id,action,word,provider,meta)
  values (
    null,p_action,'',p_provider,
    jsonb_build_object(
      'telemetry_version',2,
      'request_id',p_request_id,
      'attempt',p_attempt,
      'lookup_type',v_lookup_type,
      'model',p_model,
      'http_status',p_http_status,
      'duration_ms',p_duration_ms,
      'outcome',p_outcome,
      'usage_available',v_usage is not null,
      'ai_usage',v_usage
    ) || case when v_hedged is null then '{}'::jsonb
      else jsonb_build_object('hedged',v_hedged,'winner',v_winner,'loser',v_loser) end
      || case when v_reason is null then '{}'::jsonb
      else jsonb_build_object('reject_reason',v_reason) end
      || case when v_downgraded is null then '{}'::jsonb
      else jsonb_build_object('downgraded',true) end
  )
  on conflict ((meta->>'request_id'),(meta->>'attempt'))
    where meta->>'telemetry_version' = '2'
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.dict_events
    where meta->>'telemetry_version' = '2'
      and meta->>'request_id' = p_request_id::text
      and meta->>'attempt' = p_attempt::text;
  end if;

  return v_id;
end;
$function$;

notify pgrst, 'reload schema';
