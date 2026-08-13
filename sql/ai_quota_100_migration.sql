-- Breeze 테스트 기간 AI 한도 마이그레이션
-- Supabase SQL Editor의 새 쿼리에 이 파일 전체를 붙여넣고 한 번 실행하세요.
-- 기존 2인자 함수의 존재 여부와 무관하게 새 3인자 함수를 만듭니다.

create or replace function public.take_ai_quota(
  p_user uuid,
  p_limit integer,
  p_cost integer
)
returns jsonb
language plpgsql
security definer
as $$
declare c integer;
begin
  insert into public.ai_usage (user_id, calls)
    select p_user, greatest(1, p_cost)
    where greatest(1, p_cost) <= p_limit
    on conflict (user_id, day) do update
      set calls = ai_usage.calls + greatest(1, p_cost)
      where ai_usage.calls + greatest(1, p_cost) <= p_limit
    returning calls into c;

  if c is null then
    select calls into c
      from public.ai_usage
      where user_id = p_user
        and day = (now() at time zone 'utc')::date;
    return jsonb_build_object('ok', false, 'calls', coalesce(c, 0));
  end if;

  return jsonb_build_object('ok', true, 'calls', c);
end
$$;

revoke all on function public.take_ai_quota(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.take_ai_quota(uuid, integer, integer)
  to service_role;

-- 성공 확인: 결과에 uuid, integer, integer가 보이면 완료입니다.
select pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'take_ai_quota';
