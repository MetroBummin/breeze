-- Apply before deploying dict/look_v2. No changes to existing usage/history.
-- Only usable, validated word answers debit quota. A receipt and its debit
-- commit in one transaction; losing the HTTP response can safely replay it.
create table public.word_lookup_receipts (
  subject text not null,
  request_id uuid not null,
  fingerprint text not null,
  user_id uuid references auth.users(id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  primary key (subject, request_id)
);
create index word_lookup_receipts_user_idx on public.word_lookup_receipts(user_id) where user_id is not null;
alter table public.word_lookup_receipts enable row level security;
revoke all on public.word_lookup_receipts from public, anon, authenticated;
grant select, insert, delete on public.word_lookup_receipts to service_role;

create function public.word_lookup_receipt(
  p_user uuid, p_device text, p_request uuid, p_fingerprint text,
  p_answer jsonb default null, p_limit integer default 300,
  p_anon_limit integer default 10, p_anon_cap integer default 2000
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor text; prior public.word_lookup_receipts%rowtype;
  today date := (now() at time zone 'Asia/Seoul')::date;
  c integer; d integer; verdict jsonb; effective_limit integer := p_limit;
begin
  if p_request is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit <> 300 or p_anon_limit is null or p_anon_limit < 1
    or p_anon_cap is null or p_anon_cap < 1 then
    raise exception 'invalid lookup receipt';
  end if;
  if p_user is null and (p_device is null or length(p_device) < 8 or length(p_device) > 64) then
    return jsonb_build_object('status','login_required');
  end if;
  if p_user is not null and to_regclass('public.ai_quota_overrides') is not null then
    execute 'select daily_limit from public.ai_quota_overrides where user_id=$1 and (expires_at is null or expires_at>now()) limit 1' into effective_limit using p_user;
    effective_limit := least(5000,greatest(1,coalesce(effective_limit,p_limit)));
  end if;
  actor := case when p_user is null then 'd:' || p_device else 'u:' || p_user::text end;
  -- Serializes same logical request, including concurrent/lost-response retries.
  perform pg_advisory_xact_lock(hashtextextended(actor || ':' || p_request::text, 0));
  select * into prior from public.word_lookup_receipts where subject=actor and request_id=p_request;
  if p_user is not null then
    select calls into c from public.ai_usage where user_id=p_user and day=today;
  else
    select calls into c from public.anon_usage where device=p_device;
  end if;
  c := coalesce(c,0);
  if prior.request_id is not null then
    if prior.fingerprint <> p_fingerprint then return jsonb_build_object('status','request_conflict'); end if;
    return jsonb_build_object('status','replay','answer',prior.answer,'left',greatest(0,(case when p_user is null then p_anon_limit else effective_limit end)-c));
  end if;
  if c >= (case when p_user is null then p_anon_limit else effective_limit end) then
    return jsonb_build_object('status',case when p_user is null then 'anon_exhausted' else 'quota_exceeded' end,'left',0,'limit',effective_limit);
  end if;
  if p_user is null then
    select calls into d from public.anon_daily where day=today;
    if coalesce(d,0)>=p_anon_cap then return jsonb_build_object('status','login_required'); end if;
  end if;
  if p_answer is null then
    return jsonb_build_object('status','ok');
  end if;
  if jsonb_typeof(p_answer) <> 'object' or length(trim(coalesce(p_answer->>'ko',''))) = 0 then
    raise exception 'unusable lookup answer';
  end if;
  if p_user is not null then
    verdict := public.take_ai_quota(p_user,p_limit,1);
    if not (verdict->>'ok')::boolean then return jsonb_build_object('status','quota_exceeded','left',0,'limit',effective_limit); end if;
    c := (verdict->>'calls')::integer;
    effective_limit := coalesce((verdict->>'limit')::integer,effective_limit);
  else
    insert into public.anon_usage(device,calls) values(p_device,1)
      on conflict(device) do update set calls=anon_usage.calls+1,last_at=now()
      where anon_usage.calls < p_anon_limit returning calls into c;
    if c is null then return jsonb_build_object('status','anon_exhausted','left',0); end if;
    insert into public.anon_daily(day,calls) values(today,1)
      on conflict(day) do update set calls=anon_daily.calls+1
      where anon_daily.calls < p_anon_cap returning calls into d;
    if d is null then
      update public.anon_usage set calls=calls-1 where device=p_device;
      return jsonb_build_object('status','login_required');
    end if;
  end if;
  insert into public.word_lookup_receipts(subject,request_id,fingerprint,user_id,answer)
    values(actor,p_request,p_fingerprint,p_user,p_answer);
  return jsonb_build_object('status','replay','answer',p_answer,'left',greatest(0,(case when p_user is null then p_anon_limit else effective_limit end)-c));
end $$;
revoke all on function public.word_lookup_receipt(uuid,text,uuid,text,jsonb,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.word_lookup_receipt(uuid,text,uuid,text,jsonb,integer,integer,integer) to service_role;
