-- Breeze 사전 서버 (몇 번을 실행해도 안전 — 이미 있으면 건너뜁니다)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
--
-- 여기서 만드는 것은 두 가지뿐입니다.
--   ai_usage     하루 AI 호출 한도. 한 사람이 예산을 다 태우지 못하게 막습니다.
--   dict_events  사람들이 사전으로 "무엇을 했는가". Breeze 의 진짜 자산.
--
-- 낱말 뜻을 서버에 쌓는 표(dict_shared)는 없습니다. 뜻은 AI 가 문장을 보고 그때그때
-- 답하고, 그 답은 그 사람 기기에만 남습니다. 이유는 DICT.md 에 적어 두었습니다.
--
-- 사용자가 읽던 낱말·뜻·문장·책 제목과 그 지문은 저장하지 않습니다.

-- ────────────────────────────────────────────────────────────
-- 1) 하루 AI 한도
-- ────────────────────────────────────────────────────────────
-- 이제 AI 가 뜻의 유일한 출처입니다. 그래서 이 표가 유일한 비용 통제 장치입니다.
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  calls    integer not null default 0,
  primary key (user_id, day)
);

-- 한 번의 낱말 조회는 1, 문장 해석은 2를 씁니다. 남은 양을 서버가 돌려주므로
-- 앱이 추측하지 않습니다. 함수에는 사용량 데이터가 들어 있지 않으므로 재실행할 때
-- 3인자 함수만 안전하게 다시 만듭니다. ai_usage 표의 기존 기록은 그대로 유지됩니다.
drop function if exists public.take_ai_quota(uuid, integer, integer);
create function public.take_ai_quota(p_user uuid, p_limit integer, p_cost integer)
returns jsonb language plpgsql security definer as $$
declare c integer;
begin
  insert into public.ai_usage (user_id, calls)
    select p_user, greatest(1,p_cost) where greatest(1,p_cost) <= p_limit
    on conflict (user_id, day) do update set calls = ai_usage.calls + greatest(1,p_cost)
      where ai_usage.calls + greatest(1,p_cost) <= p_limit
    returning calls into c;
  if c is null then
    select calls into c from public.ai_usage
      where user_id = p_user and day = (now() at time zone 'utc')::date;
    return jsonb_build_object('ok', false, 'calls', coalesce(c,0));
  end if;
  return jsonb_build_object('ok', true, 'calls', c);
end $$;

-- 오늘 몇 번 썼는지 세기만 합니다(한 칸 쓰지 않음). 앱이 남은 횟수를 보여줄 때 씁니다.
create or replace function public.peek_ai_quota(p_user uuid)
returns integer language sql security definer as $$
  select coalesce((select calls from public.ai_usage
                    where user_id = p_user
                      and day = (now() at time zone 'utc')::date), 0);
$$;

-- ────────────────────────────────────────────────────────────
-- 1-b) 로그인 전 무료 체험
-- ────────────────────────────────────────────────────────────
-- Breeze 가 남과 다른 점은 "이 문장에서 이 낱말이 이런 뜻"이라고 답하는 것 하나입니다.
-- 그런데 그게 로그인 뒤에만 보이면, 처음 온 사람이 보는 것은 구글 번역 결과입니다.
-- 그 상태로 "로그인하면 좋아져요"라고 말해 봐야 믿을 이유가 없습니다. 그래서 먼저
-- 보여 주고 나서 물어봅니다 — 기기당 평생 몇 번(기본 10번).
--
-- 하루 10번이 아니라 평생 10번인 이유: 하루 10번이면 아무도 로그인하지 않습니다.
-- 이건 무료 요금제가 아니라 맛보기입니다.
--
-- 기기 표시는 브라우저 저장소를 지우면 새로 생깁니다. 막을 방법이 없고, 막을
-- 값어치도 없습니다(10번 = 20원 남짓). 대신 예산을 지키는 진짜 벽은 아래
-- anon_daily 입니다 — 자동화된 요청이 예산을 통째로 태우는 것만 막으면 됩니다.
create table if not exists public.anon_usage (
  device    text primary key,
  calls     integer not null default 0,
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now()
);

-- 로그인 전 요청 전체의 하루 총량. 차단기입니다.
create table if not exists public.anon_daily (
  day    date primary key default (now() at time zone 'utc')::date,
  calls  integer not null default 0
);

create or replace function public.take_anon_quota(
  p_device text, p_limit integer, p_daily_cap integer)
returns jsonb language plpgsql security definer as $$
declare c integer; d integer;
begin
  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('status','bad_device');
  end if;

  -- 기기 몫을 먼저 봅니다. 이미 다 쓴 기기는 아래 하루 총량을 건드리지 않습니다 —
  -- 안 그러면 다 쓴 사람들의 재시도가 남들 몫의 차단기를 당깁니다.
  insert into public.anon_usage (device, calls) values (p_device, 1)
    on conflict (device) do update set calls = anon_usage.calls + 1, last_at = now()
    returning calls into c;
  if c > p_limit then
    return jsonb_build_object('status','spent','calls',c);
  end if;

  insert into public.anon_daily (day, calls) values ((now() at time zone 'utc')::date, 1)
    on conflict (day) do update set calls = anon_daily.calls + 1
    returning calls into d;
  if d > p_daily_cap then
    -- 우리 사정으로 막은 것이므로 이 사람의 체험 횟수는 돌려줍니다.
    update public.anon_usage set calls = calls - 1 where device = p_device;
    return jsonb_build_object('status','closed');
  end if;

  return jsonb_build_object('status','ok','calls',c);
end $$;

-- ────────────────────────────────────────────────────────────
-- 2) 행동 기록 — 낱말이 아니라 "사람이 무엇을 했는가"
-- ────────────────────────────────────────────────────────────
-- 낱말과 뜻 자체는 상품입니다. 위키낱말사전에도 있고 누구나 3개월이면 따라옵니다.
-- 못 따라오는 것은 "이 사람이 AI 의 답을 고쳤다", "이 문장에서 다른 뜻을 다시 물었다",
-- "이건 저장했고 저건 아는 낱말로 뺐다" 의 기록입니다. 그게 이 표입니다.
--
-- action 값
--   look   낱말을 눌러 AI 가 답했다        (ai_ko 가 채워짐)
--   retry  "다른 뜻으로 다시" 를 눌렀다     ← AI 가 틀렸다는 가장 강한 신호
--   edit   뜻을 직접 고쳐 썼다              (user_ko 가 ai_ko 와 다름)
--   pick   아래 칩으로 다른 뜻을 골랐다
--   star   모르는 정도를 바꿨다
--   known  아는 낱말이라 단어장에서 뺐다
--   quota  한도에 걸려 AI 를 못 불렀다      ← 한도를 올릴 근거
--   explain 문장을 통째로 물어봤다          ← 낱말을 다 알아도 안 읽힌 문장
--           (word 가 빈 칸입니다. 하루 5번 한도를 세는 것도 이 줄입니다 —
--            표를 하나 더 두지 않고 "실제로 답을 받은 횟수"를 셉니다)
create table if not exists public.dict_events (
  id        bigserial primary key,
  user_id   uuid references auth.users(id) on delete set null,
  at        timestamptz not null default now(),
  action    text not null,
  word      text not null default '', -- 호환용 빈 칸. 실제 낱말은 저장하지 않음
  provider  text,
  meta      jsonb not null default '{}'::jsonb
);

create index if not exists dict_events_action_idx on public.dict_events (action, at desc);
create index if not exists dict_events_user_idx   on public.dict_events (user_id, at desc);
drop index if exists public.dict_events_word_idx;
drop index if exists public.dict_events_fp_idx;
alter table public.dict_events
  drop column if exists clicked,
  drop column if exists lemma,
  drop column if exists pos,
  drop column if exists ai_ko,
  drop column if exists user_ko,
  drop column if exists sent_fp,
  drop column if exists sent_len,
  drop column if exists cue_before,
  drop column if exists cue_after,
  drop column if exists book_fp;

-- ────────────────────────────────────────────────────────────
-- 3) 접근 권한
-- ────────────────────────────────────────────────────────────
-- 두 표 모두 앱이 직접 읽고 쓰지 않습니다. dict Edge Function 만 손댑니다.
-- RLS 를 켜고 정책을 하나도 만들지 않으면, service_role(= Edge Function)만 통과합니다.
-- 대시보드에서는 그대로 보입니다.
alter table public.ai_usage    enable row level security;
alter table public.dict_events enable row level security;
alter table public.anon_usage  enable row level security;
alter table public.anon_daily  enable row level security;

revoke all on public.ai_usage    from anon, authenticated;
revoke all on public.dict_events from anon, authenticated;
revoke all on public.anon_usage  from anon, authenticated;
revoke all on public.anon_daily  from anon, authenticated;

revoke all on function public.take_ai_quota(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.peek_ai_quota(uuid)          from public, anon, authenticated;
revoke all on function public.take_anon_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_ai_quota(uuid, integer, integer) to service_role;
grant execute on function public.peek_ai_quota(uuid)          to service_role;
grant execute on function public.take_anon_quota(text, integer, integer) to service_role;

-- ────────────────────────────────────────────────────────────
-- 4) 예전 공용 사전 치우기
-- ────────────────────────────────────────────────────────────
-- 공용 사전은 두 줄 중 "덜 중요한 줄"만 캐시하면서, 틀린 뜻을 확신 있게 내놓을
-- 새 경로를 하나 만들었습니다. 그래서 접었습니다. 아래 세 줄이 그 흔적을 지웁니다.
-- (표에 든 것은 AI 가 만든 낱말 항목뿐입니다. 사용자 데이터가 아닙니다.)
drop function if exists public.next_sense_no(text, text, text);
drop function if exists public.bump_sense_cue(text, text, integer, text);
drop table    if exists public.sense_cues;
drop table    if exists public.dict_shared;

-- ────────────────────────────────────────────────────────────
-- 5) 확인
-- ────────────────────────────────────────────────────────────
select tablename from pg_tables
where schemaname = 'public' and tablename in ('ai_usage','dict_events','dict_shared','sense_cues');
-- ai_usage, dict_events 두 줄만 나와야 맞습니다.

-- 들여다보기 —
--   AI 가 자주 틀리는 낱말 (retry 가 많은 순)
--     select word, count(*) from public.dict_events where action = 'retry'
--     group by word order by count(*) desc limit 30;
--
--   사람이 손으로 고친 뜻 (AI 답과 나란히)
--     select word, ai_ko, user_ko, cue_before, cue_after, at
--     from public.dict_events where action = 'edit' order by at desc limit 50;
--
--   오늘 누가 얼마나 썼나
--     select user_id, calls from public.ai_usage
--     where day = (now() at time zone 'utc')::date order by calls desc;
