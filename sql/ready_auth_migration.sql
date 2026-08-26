-- READY 최소 인증 migration
-- ready_milestone_1.sql 실행 후 적용합니다. 여러 번 실행해도 안전합니다.

create extension if not exists pgcrypto;

alter table public.ready_students
  add column if not exists pin_hash text;

create table if not exists public.ready_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  actor_type text not null check (actor_type in ('student', 'admin')),
  student_id uuid references public.ready_students(id) on delete cascade,
  remembered boolean not null default false,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (actor_type = 'student' and student_id is not null) or
    (actor_type = 'admin' and student_id is null)
  )
);

create index if not exists ready_sessions_active_idx
  on public.ready_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists public.ready_login_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  successful boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists ready_login_attempts_recent_idx
  on public.ready_login_attempts(identifier, created_at desc);

-- PIN은 이 함수 안에서 bcrypt로 바뀐 뒤에만 ready_students에 들어갑니다.
create or replace function public.ready_create_student(
  p_name text,
  p_pin text,
  p_sort_order integer default 0
)
returns table(id uuid, name text, sort_order integer, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 40 then
    raise exception '학생 이름을 확인해 주세요.';
  end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then
    raise exception 'PIN은 숫자 4~6자리여야 합니다.';
  end if;
  return query
    insert into ready_students(name, sort_order, pin_hash)
    values (trim(p_name), coalesce(p_sort_order, 0), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
    returning ready_students.id, ready_students.name, ready_students.sort_order, ready_students.active;
end;
$$;

create or replace function public.ready_set_student_pin(p_student_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then
    raise exception 'PIN은 숫자 4~6자리여야 합니다.';
  end if;
  update ready_students
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
    where id = p_student_id;
  if not found then raise exception '학생을 찾지 못했습니다.'; end if;
  update ready_sessions set revoked_at = now()
    where actor_type = 'student' and student_id = p_student_id and revoked_at is null;
end;
$$;

create or replace function public.ready_verify_student_pin(p_student_id uuid, p_pin text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select active and pin_hash is not null and pin_hash = extensions.crypt(p_pin, pin_hash)
    from ready_students where id = p_student_id
  ), false);
$$;

alter table public.ready_sessions enable row level security;
alter table public.ready_login_attempts enable row level security;

revoke all on public.ready_sessions from anon, authenticated;
revoke all on public.ready_login_attempts from anon, authenticated;
revoke all on function public.ready_create_student(text, text, integer) from public, anon, authenticated;
revoke all on function public.ready_set_student_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.ready_verify_student_pin(uuid, text) from public, anon, authenticated;

grant all on table public.ready_sessions, public.ready_login_attempts to service_role;
grant usage, select on sequence public.ready_login_attempts_id_seq to service_role;
grant execute on function public.ready_create_student(text, text, integer) to service_role;
grant execute on function public.ready_set_student_pin(uuid, text) to service_role;
grant execute on function public.ready_verify_student_pin(uuid, text) to service_role;

-- 예전 공개 직접접근이 남아 있지 않도록 다시 명시합니다.
revoke all on public.ready_students from anon, authenticated;
