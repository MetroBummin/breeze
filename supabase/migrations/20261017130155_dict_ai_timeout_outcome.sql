-- Allow the dict function to record its own provider aborts as timeout.
-- Apply with or before deploying dict. Until then, timeout rows are rejected
-- and the lookup itself still succeeds.
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

  if p_usage is not null and p_usage <> 'null'::jsonb then
    if jsonb_typeof(p_usage) <> 'object' then
      raise exception 'invalid usage object' using errcode = '22023';
    end if;
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
      'model',p_model,
      'http_status',p_http_status,
      'duration_ms',p_duration_ms,
      'outcome',p_outcome,
      'usage_available',v_usage is not null,
      'ai_usage',v_usage
    )
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
