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
-- 사용자가 읽던 문장은 여기에 한 글자도 들어가지 않습니다. 문장은 지문(fingerprint)으로만
-- 남고, 지문은 서버 비밀값(DICT_FP_SALT)을 섞어 만들기 때문에 되돌릴 수 없습니다.

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

-- 한 칸 쓰고 "아직 한도 안이냐"를 돌려줍니다. AI 를 부르기 직전에 호출합니다.
-- 첫 호출에서 calls 를 1로 넣는 것이 중요합니다 — 기본값 0으로 넣으면 첫 호출이 공짜가 됩니다.
create or replace function public.take_ai_quota(p_user uuid, p_limit integer)
returns boolean language plpgsql security definer as $$
declare c integer;
begin
  insert into public.ai_usage (user_id, calls) values (p_user, 1)
    on conflict (user_id, day) do update set calls = ai_usage.calls + 1
    returning calls into c;
  return c <= p_limit;
end $$;

-- 오늘 몇 번 썼는지 세기만 합니다(한 칸 쓰지 않음). 앱이 남은 횟수를 보여줄 때 씁니다.
create or replace function public.peek_ai_quota(p_user uuid)
returns integer language sql security definer as $$
  select coalesce((select calls from public.ai_usage
                    where user_id = p_user
                      and day = (now() at time zone 'utc')::date), 0);
$$;

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
create table if not exists public.dict_events (
  id        bigserial primary key,
  user_id   uuid references auth.users(id) on delete set null,
  at        timestamptz not null default now(),
  action    text not null,
  word      text not null,          -- 화면에 뜬 표제형
  clicked   text,                   -- 실제로 누른 형태 (continues)
  lemma     text,
  pos       text,
  ai_ko     text,                   -- AI 가 준 뜻
  user_ko   text,                   -- 사람이 최종적으로 쓴 뜻
  -- ── 문장에 대해 남기는 것 ──
  sent_fp   text,                   -- 문장 지문. 소금을 섞은 SHA-256 앞 8바이트
  sent_len  integer,                -- 문장 낱말 수
  cue_before text,                  -- 바로 앞 낱말. 기능어 닫힌 목록에 있을 때만
  cue_after  text,                  -- 바로 뒤 낱말. 같은 규칙 (continue → "to")
  book_fp   text,                   -- 책 제목 지문. 같은 책끼리 묶어 보기 위해서만
  provider  text,
  meta      jsonb not null default '{}'::jsonb
);

create index if not exists dict_events_word_idx   on public.dict_events (word, at desc);
create index if not exists dict_events_action_idx on public.dict_events (action, at desc);
create index if not exists dict_events_user_idx   on public.dict_events (user_id, at desc);
-- 같은 문장을 여러 사람이 물어본 경우를 찾기 위한 색인
create index if not exists dict_events_fp_idx     on public.dict_events (sent_fp) where sent_fp is not null;

-- ────────────────────────────────────────────────────────────
-- 3) 접근 권한
-- ────────────────────────────────────────────────────────────
-- 두 표 모두 앱이 직접 읽고 쓰지 않습니다. dict Edge Function 만 손댑니다.
-- RLS 를 켜고 정책을 하나도 만들지 않으면, service_role(= Edge Function)만 통과합니다.
-- 대시보드에서는 그대로 보입니다.
alter table public.ai_usage    enable row level security;
alter table public.dict_events enable row level security;

revoke all on public.ai_usage    from anon, authenticated;
revoke all on public.dict_events from anon, authenticated;

revoke all on function public.take_ai_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.peek_ai_quota(uuid)          from public, anon, authenticated;
grant execute on function public.take_ai_quota(uuid, integer) to service_role;
grant execute on function public.peek_ai_quota(uuid)          to service_role;

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
