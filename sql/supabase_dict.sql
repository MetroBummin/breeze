-- Breeze 공용 사전 (몇 번을 실행해도 안전 — 이미 있으면 건너뜁니다)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
--
-- 여기서 만드는 것은 세 가지입니다.
--   dict_shared  모두가 함께 쓰는 사전. 낱말 하나를 누가 한 번 물어보면 그 뒤로는 모두가 공짜로 씁니다.
--   sense_cues   "이 문장은 몇 번 뜻인가"를 AI 없이 가려내기 위한 근거. 쓸수록 쌓입니다.
--   ai_usage     하루 AI 호출 한도. 한 사람이 예산을 다 태우지 못하게 막습니다.
--
-- 사용자 본문·예문은 여기에 한 글자도 들어가지 않습니다. 자세한 규칙은 DICT.md.

-- ────────────────────────────────────────────────────────────
-- 1) 공용 사전
-- ────────────────────────────────────────────────────────────
create table if not exists public.dict_shared (
  lang        text not null default 'en',
  word        text not null,
  ui_lang     text not null default 'ko',
  kind        text not null default 'word',   -- 'word' | 'phrase' (숙어)
  lemma       text,
  pos         text,
  senses      jsonb not null default '[]'::jsonb,
  sense_seq   integer not null default 0,     -- 다음 뜻 번호. 절대 줄지 않습니다
  hits        integer not null default 0,
  freq_rank   integer,
  source      text default 'ai',
  model       text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (lang, word, ui_lang)
);

-- v1 스펙으로 이미 표를 만들어 두었다면 빠진 열만 채웁니다.
alter table public.dict_shared add column if not exists kind      text    not null default 'word';
alter table public.dict_shared add column if not exists sense_seq integer not null default 0;
alter table public.dict_shared add column if not exists meta      jsonb   not null default '{}'::jsonb;

create index if not exists dict_shared_lemma_idx on public.dict_shared (lang, lemma);
create index if not exists dict_shared_kind_idx  on public.dict_shared (lang, kind);

-- senses[] 한 칸의 모양
--   { "no":     1,                                     ← next_sense_no() 가 발급. 절대 안 바뀝니다
--     "ko":     "계속되다",
--     "def":    "to keep happening without stopping",
--     "gloss":  "멈추지 않고 이어지는 상태를 말합니다",   ← 뜻 층. 화면에 0원·0ms 로 뜨는 설명
--     "colloc": ["continue to grow", "the rain continues"],
--     "domain": "일상",
--     "deprecated": false }

-- ── 뜻 번호 발급기 ──────────────────────────────────────────
-- 번호를 사람이(코드가) 세지 않습니다. 두 사람이 같은 낱말에 동시에 뜻을 더해도
-- 한 명은 3번, 한 명은 4번을 받습니다. 겹칠 수가 없습니다.
create or replace function public.next_sense_no(p_lang text, p_word text, p_ui_lang text)
returns integer language sql security definer as $$
  update public.dict_shared
     set sense_seq = sense_seq + 1, updated_at = now()
   where lang = p_lang and word = p_word and ui_lang = p_ui_lang
  returning sense_seq;
$$;

-- ────────────────────────────────────────────────────────────
-- 2) 판별 근거 — "쓸수록 정교해진다"의 실체
-- ────────────────────────────────────────────────────────────
-- AI 가 "이 문장은 1번 뜻"이라고 답할 때마다, 그 판단의 단서만 한 칸씩 세어 둡니다.
-- cue 에 넣을 수 있는 것은 딱 두 가지뿐입니다.
--   ① 영어 기능어 닫힌 목록 (to, for, with, despite, …)
--   ② 그 낱말의 colloc 에 이미 있던 토큰 (AI 가 일반 지식으로 만든 것)
-- 그래서 아무리 쌓여도 사용자가 읽던 문장을 되짚을 수 없습니다.
create table if not exists public.sense_cues (
  lang      text not null default 'en',
  word      text not null,
  sense_no  integer not null,
  cue       text not null,
  n         integer not null default 0,
  primary key (lang, word, sense_no, cue)
);
create index if not exists sense_cues_word_idx on public.sense_cues (lang, word);

create or replace function public.bump_sense_cue(p_lang text, p_word text, p_sense integer, p_cue text)
returns void language sql security definer as $$
  insert into public.sense_cues (lang, word, sense_no, cue, n)
  values (p_lang, p_word, p_sense, p_cue, 1)
  on conflict (lang, word, sense_no, cue) do update set n = sense_cues.n + 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) 하루 AI 한도
-- ────────────────────────────────────────────────────────────
-- 로그인만 하면 쓰는 공개 사이트입니다. 이 표가 없으면 스크립트 하나가 한 달 예산을 태웁니다.
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  calls    integer not null default 0,
  primary key (user_id, day)
);

-- 한 칸 쓰고 "아직 한도 안이냐"를 돌려줍니다. AI 를 부르기 직전에 호출합니다.
create or replace function public.take_ai_quota(p_user uuid, p_limit integer)
returns boolean language plpgsql security definer as $$
declare c integer;
begin
  insert into public.ai_usage (user_id, calls) values (p_user, 1)
    on conflict (user_id, day) do update set calls = ai_usage.calls + 1
    returning calls into c;
  return c <= p_limit;
end $$;

-- ────────────────────────────────────────────────────────────
-- 4) 접근 권한
-- ────────────────────────────────────────────────────────────
-- 세 표 모두 앱이 직접 읽고 쓰지 않습니다. dict Edge Function 만 손댑니다.
-- RLS 를 켜고 정책을 하나도 만들지 않으면, service_role(= Edge Function)만 통과합니다.
alter table public.dict_shared enable row level security;
alter table public.sense_cues  enable row level security;
alter table public.ai_usage    enable row level security;

revoke all on public.dict_shared from anon, authenticated;
revoke all on public.sense_cues  from anon, authenticated;
revoke all on public.ai_usage    from anon, authenticated;

-- 함수는 Edge Function 만 부르므로 service_role 에게만 줍니다.
revoke all on function public.next_sense_no(text, text, text)   from public, anon, authenticated;
revoke all on function public.bump_sense_cue(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.take_ai_quota(uuid, integer)      from public, anon, authenticated;
grant execute on function public.next_sense_no(text, text, text)   to service_role;
grant execute on function public.bump_sense_cue(text, text, integer, text) to service_role;
grant execute on function public.take_ai_quota(uuid, integer)      to service_role;

-- ────────────────────────────────────────────────────────────
-- 5) 확인
-- ────────────────────────────────────────────────────────────
-- 아래를 실행해서 1, 2 가 차례로 나오면 번호 발급기가 살아 있는 것입니다.
--   insert into public.dict_shared (word) values ('__test__') on conflict do nothing;
--   select public.next_sense_no('en','__test__','ko');   -- 1
--   select public.next_sense_no('en','__test__','ko');   -- 2
--   delete from public.dict_shared where word = '__test__';

select tablename from pg_tables
where schemaname = 'public' and tablename in ('dict_shared','sense_cues','ai_usage');
