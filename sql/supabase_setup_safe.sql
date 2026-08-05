-- Breeze 동기화 설정 (몇 번을 실행해도 안전 — 이미 있으면 건너뜁니다)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run

-- 1) 테이블 (이미 있으면 그냥 넘어감)
create table if not exists public.words (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.positions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- 2) 행 단위 보안 켜기 (내 데이터는 나만)
alter table public.words     enable row level security;
alter table public.positions enable row level security;

drop policy if exists "own words"     on public.words;
drop policy if exists "own positions" on public.positions;

create policy "own words" on public.words
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own positions" on public.positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) 테이블 접근 권한 (← "permission denied" 오류를 고치는 부분)
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.words     to authenticated;
grant select, insert, update, delete on public.positions to authenticated;

-- 4) 확인: 아래 결과가 2줄 나오면 정상
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('words','positions');
