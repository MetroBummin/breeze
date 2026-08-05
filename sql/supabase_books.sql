-- Breeze 책 동기화 설정 (여러 번 실행해도 안전)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run

-- 1) 책 목록 테이블 (본문은 Storage에, 여기엔 제목·크기 같은 정보만)
create table if not exists public.books (
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  meta       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.books enable row level security;
drop policy if exists "own books" on public.books;
create policy "own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.books to authenticated;

-- 2) 책 본문을 담을 비공개 파일 창고
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

-- 3) 파일 접근 권한: 자기 폴더(user_id/…)만 읽고 쓸 수 있음
drop policy if exists "books read own"   on storage.objects;
drop policy if exists "books write own"  on storage.objects;
drop policy if exists "books update own" on storage.objects;
drop policy if exists "books delete own" on storage.objects;

create policy "books read own" on storage.objects for select
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "books write own" on storage.objects for insert
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "books update own" on storage.objects for update
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "books delete own" on storage.objects for delete
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) 확인: 아래가 1줄 나오면 정상
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename = 'books';
