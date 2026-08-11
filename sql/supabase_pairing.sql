-- Breeze 기기 간 E2EE 열쇠 전달용 임시 우편함
-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.sync_pairings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  request_pub jsonb not null,
  request_salt text not null,
  response_pub jsonb,
  wrapped_key jsonb,
  status text not null default 'waiting',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(user_id, code)
);

alter table public.sync_pairings enable row level security;
drop policy if exists "own sync pairings" on public.sync_pairings;
create policy "own sync pairings" on public.sync_pairings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.sync_pairings to authenticated;
create index if not exists sync_pairings_expiry_idx on public.sync_pairings(expires_at);
