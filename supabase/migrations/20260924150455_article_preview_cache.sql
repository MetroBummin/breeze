-- Public article metadata shared across readers, writable only by the Edge Function.
create table if not exists public.article_preview_cache (
  cache_key text primary key,
  source_url text not null,
  hook_title text not null,
  translated_title text not null,
  teaser text not null,
  created_at timestamptz not null default now()
);
alter table public.article_preview_cache enable row level security;
revoke all on public.article_preview_cache from anon, authenticated;
grant select, insert on public.article_preview_cache to service_role;
