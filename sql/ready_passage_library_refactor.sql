-- READY Passage Library refactor
-- Run after ready_exam_refactor.sql. Existing IDs and attempt rows are retained.

create table if not exists public.ready_textbook_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  grade text not null check (char_length(trim(grade)) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.ready_passages
  add column if not exists source_type text not null default 'TEXTBOOK'
    check (source_type in ('TEXTBOOK', 'MOCK_EXAM')),
  add column if not exists grade text not null default '1학년'
    check (char_length(trim(grade)) between 1 and 40),
  add column if not exists source_year integer,
  add column if not exists source_month smallint check (source_month between 1 and 12),
  add column if not exists source_label text not null default '',
  add column if not exists display_order integer not null default 0,
  add column if not exists textbook_group_id uuid references public.ready_textbook_groups(id) on delete set null;

alter table public.ready_passages alter column exam_id drop not null;

create table if not exists public.ready_exam_passages (
  exam_id uuid not null references public.ready_exams(id) on delete cascade,
  passage_id uuid not null references public.ready_passages(id) on delete restrict,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (exam_id, passage_id),
  unique (exam_id, position)
);

-- Preserve all current Exam memberships before the old single-parent column becomes legacy.
insert into public.ready_exam_passages(exam_id, passage_id, position)
select exam_id, id, position from public.ready_passages
where exam_id is not null
on conflict (exam_id, passage_id) do nothing;

with numbered as (
  select id, row_number() over(order by created_at, id)::integer - 1 as position
  from public.ready_passages
)
update public.ready_passages p set display_order = numbered.position from numbered where p.id = numbered.id;

alter table public.ready_attempts add column if not exists exam_id uuid references public.ready_exams(id) on delete restrict;
-- The original Exam is immutable historical context. Temporarily allow this
-- one-time migration update, then restore the append-only trigger immediately.
alter table public.ready_attempts disable trigger ready_attempts_no_update;
update public.ready_attempts a
set exam_id = p.exam_id
from public.ready_questions q join public.ready_passages p on p.id = q.passage_id
where a.exam_id is null and a.question_id = q.id and p.exam_id is not null;
alter table public.ready_attempts enable trigger ready_attempts_no_update;

create index if not exists ready_exam_passages_passage_idx on public.ready_exam_passages(passage_id, position);
create index if not exists ready_passages_library_idx on public.ready_passages(grade, source_type, display_order, created_at desc);
create index if not exists ready_attempts_exam_created_idx on public.ready_attempts(exam_id, created_at desc);

alter table public.ready_textbook_groups enable row level security;
alter table public.ready_exam_passages enable row level security;
revoke all on public.ready_textbook_groups, public.ready_exam_passages from anon, authenticated;
grant all on public.ready_textbook_groups, public.ready_exam_passages to service_role;
