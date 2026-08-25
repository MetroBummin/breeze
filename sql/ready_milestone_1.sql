-- READY / Digital Audit — Milestone 1
-- Supabase SQL Editor에서 한 번 실행합니다. Breeze의 기존 테이블은 건드리지 않습니다.

create extension if not exists pgcrypto;

create table if not exists public.ready_students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ready_study_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ready_passages (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null references public.ready_study_sets(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  source_text text not null check (char_length(trim(source_text)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ready_passage_sentences (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references public.ready_passages(id) on delete cascade,
  sentence_index integer not null check (sentence_index >= 0),
  text text not null check (char_length(trim(text)) > 0),
  created_at timestamptz not null default now(),
  unique (passage_id, sentence_index)
);

-- Question은 ORDER 전용 테이블이 아닙니다. 이후 type과 payload만 확장합니다.
create table if not exists public.ready_questions (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references public.ready_passages(id) on delete cascade,
  type text not null default 'order' check (char_length(type) between 1 and 40),
  difficulty smallint,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  generation integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ready_publications (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null references public.ready_study_sets(id) on delete cascade,
  active boolean not null default true,
  published_at timestamptz not null default now()
);

create unique index if not exists ready_one_active_publication_per_set
  on public.ready_publications(study_set_id) where active;

create table if not exists public.ready_publication_questions (
  publication_id uuid not null references public.ready_publications(id) on delete cascade,
  question_id uuid not null references public.ready_questions(id) on delete restrict,
  position integer not null default 0,
  primary key (publication_id, question_id),
  unique (publication_id, position)
);

-- Attempt는 수정되는 성적표가 아니라 append-only raw event입니다.
create table if not exists public.ready_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ready_students(id) on delete restrict,
  question_id uuid not null references public.ready_questions(id) on delete restrict,
  publication_id uuid not null references public.ready_publications(id) on delete restrict,
  response jsonb not null,
  correct boolean not null,
  elapsed_ms integer not null check (elapsed_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ready_attempts_student_created_idx
  on public.ready_attempts(student_id, created_at desc);
create index if not exists ready_attempts_question_created_idx
  on public.ready_attempts(question_id, created_at desc);

create or replace function public.ready_attempts_are_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'READY attempts are append-only';
end;
$$;

drop trigger if exists ready_attempts_no_update on public.ready_attempts;
create trigger ready_attempts_no_update before update or delete on public.ready_attempts
for each row execute function public.ready_attempts_are_immutable();

-- 기존 게시본을 내리고 새 게시본을 만드는 두 단계가 반드시 함께 성공하도록 묶습니다.
create or replace function public.ready_publish_study_set(p_study_set_id uuid)
returns table(publication_id uuid, question_count integer)
language plpgsql security definer set search_path = public as $$
declare
  v_publication_id uuid;
  v_count integer;
begin
  select count(*)::integer into v_count
  from ready_questions q
  join ready_passages p on p.id = q.passage_id
  where p.study_set_id = p_study_set_id and q.status = 'approved';
  if v_count = 0 then raise exception '승인된 문제가 하나 이상 필요합니다.'; end if;

  update ready_publications set active = false
  where study_set_id = p_study_set_id and active;
  insert into ready_publications(study_set_id) values (p_study_set_id)
  returning id into v_publication_id;
  insert into ready_publication_questions(publication_id, question_id, position)
  select v_publication_id, q.id, row_number() over(order by p.position, p.created_at, q.created_at)::integer - 1
  from ready_questions q join ready_passages p on p.id = q.passage_id
  where p.study_set_id = p_study_set_id and q.status = 'approved';
  return query select v_publication_id, v_count;
end;
$$;

alter table public.ready_students enable row level security;
alter table public.ready_study_sets enable row level security;
alter table public.ready_passages enable row level security;
alter table public.ready_passage_sentences enable row level security;
alter table public.ready_questions enable row level security;
alter table public.ready_publications enable row level security;
alter table public.ready_publication_questions enable row level security;
alter table public.ready_attempts enable row level security;

-- 브라우저는 테이블을 직접 읽지 않습니다. 모든 접근은 ready Edge Function에서
-- service-role로 수행하며, 학생에게 correctOrder가 내려가는 일을 막습니다.
revoke all on public.ready_students from anon, authenticated;
revoke all on public.ready_study_sets from anon, authenticated;
revoke all on public.ready_passages from anon, authenticated;
revoke all on public.ready_passage_sentences from anon, authenticated;
revoke all on public.ready_questions from anon, authenticated;
revoke all on public.ready_publications from anon, authenticated;
revoke all on public.ready_publication_questions from anon, authenticated;
revoke all on public.ready_attempts from anon, authenticated;
revoke all on function public.ready_publish_study_set(uuid) from public, anon, authenticated;
grant execute on function public.ready_publish_study_set(uuid) to service_role;

-- 최초 학생은 필요에 맞게 바꿔 실행합니다.
-- insert into public.ready_students(name, sort_order) values
--   ('김유빈', 10), ('김해성', 20), ('박지유', 30);
