-- READY Exam-Passage-Question refactor
-- Apply after ready_milestone_1.sql and ready_auth_migration.sql.
-- Legacy StudySet/Publication rows are preserved only so existing attempts remain auditable.

create table if not exists public.ready_exams (
  id uuid primary key default gen_random_uuid(),
  school text not null check (char_length(trim(school)) between 1 and 80),
  grade text not null check (char_length(trim(grade)) between 1 and 40),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '',
  legacy_study_set_id uuid unique references public.ready_study_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ready_students
  add column if not exists school text not null default '미지정',
  add column if not exists grade text not null default '미지정';

alter table public.ready_passages
  add column if not exists exam_id uuid references public.ready_exams(id) on delete cascade;

-- The old parent is retained only for migrated rows; new Passages have an Exam parent.
alter table public.ready_passages alter column study_set_id drop not null;

-- Existing test/early-production rows become one legacy Exam per old StudySet.
insert into public.ready_exams (school, grade, title, description, legacy_study_set_id)
select '미지정', '미지정', s.title, s.description, s.id
from public.ready_study_sets s
where not exists (
  select 1 from public.ready_exams e where e.legacy_study_set_id = s.id
);

update public.ready_passages p
set exam_id = e.id
from public.ready_exams e
where p.exam_id is null and e.legacy_study_set_id = p.study_set_id;

alter table public.ready_passages alter column exam_id set not null;
create index if not exists ready_exams_school_grade_idx on public.ready_exams(school, grade, created_at desc);
create index if not exists ready_passages_exam_position_idx on public.ready_passages(exam_id, position, created_at);
create index if not exists ready_students_school_grade_sort_idx on public.ready_students(school, grade, sort_order, name);

-- Publication is no longer part of a new submission. Old rows keep their source id.
alter table public.ready_attempts alter column publication_id drop not null;

-- A reviewed question is immediately visible to its matching Exam cohort.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.ready_questions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.ready_questions drop constraint %I', c.conname);
  end loop;
end $$;
update public.ready_questions set status = 'available' where status = 'approved';
alter table public.ready_questions
  add constraint ready_questions_status_check check (status in ('draft', 'available'));

-- Replace the old student creator so school/grade are required at the server boundary.
drop function if exists public.ready_create_student(text, text, integer);
create or replace function public.ready_create_student(
  p_name text,
  p_school text,
  p_grade text,
  p_pin text,
  p_sort_order integer default 0
)
returns table(id uuid, name text, school text, grade text, sort_order integer, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 40 then
    raise exception '학생 이름을 확인해 주세요.';
  end if;
  if trim(coalesce(p_school, '')) = '' or char_length(trim(p_school)) > 80 then
    raise exception '학교를 확인해 주세요.';
  end if;
  if trim(coalesce(p_grade, '')) = '' or char_length(trim(p_grade)) > 40 then
    raise exception '학년을 확인해 주세요.';
  end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then
    raise exception 'PIN은 숫자 4~6자리여야 합니다.';
  end if;
  return query
    insert into public.ready_students(name, school, grade, sort_order, pin_hash)
    values (trim(p_name), trim(p_school), trim(p_grade), coalesce(p_sort_order, 0),
      extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
    returning ready_students.id, ready_students.name, ready_students.school,
      ready_students.grade, ready_students.sort_order, ready_students.active;
end;
$$;

alter table public.ready_exams enable row level security;
revoke all on public.ready_exams from anon, authenticated;
grant all on public.ready_exams to service_role;
revoke all on function public.ready_create_student(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.ready_create_student(text, text, text, text, integer) to service_role;
