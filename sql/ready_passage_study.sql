-- READY Passage Study milestone. Run after ready_passage_library_refactor.sql.
-- Sentence translations are prepared before students open a Passage.

alter table public.ready_passages
  add column if not exists study_status text not null default 'ready'
    check (study_status in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists translation_source text not null default 'none'
    check (translation_source in ('none', 'teacher', 'ai')),
  add column if not exists processing_error text not null default '';

alter table public.ready_passage_sentences
  add column if not exists translation text not null default '';

create table if not exists public.ready_word_lookup_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ready_students(id) on delete restrict,
  exam_id uuid not null references public.ready_exams(id) on delete restrict,
  passage_id uuid not null references public.ready_passages(id) on delete restrict,
  sentence_id uuid references public.ready_passage_sentences(id) on delete set null,
  surface_word text not null check (char_length(trim(surface_word)) between 1 and 100),
  normalized_word text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ready_saved_words (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ready_students(id) on delete restrict,
  passage_id uuid not null references public.ready_passages(id) on delete restrict,
  sentence_id uuid references public.ready_passage_sentences(id) on delete set null,
  word text not null check (char_length(trim(word)) between 1 and 100),
  normalized_word text not null,
  meaning_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (student_id, passage_id, normalized_word)
);

create table if not exists public.ready_sentence_translation_view_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ready_students(id) on delete restrict,
  exam_id uuid not null references public.ready_exams(id) on delete restrict,
  passage_id uuid not null references public.ready_passages(id) on delete restrict,
  sentence_id uuid not null references public.ready_passage_sentences(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.ready_saved_sentences (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ready_students(id) on delete restrict,
  exam_id uuid not null references public.ready_exams(id) on delete restrict,
  passage_id uuid not null references public.ready_passages(id) on delete restrict,
  sentence_id uuid not null references public.ready_passage_sentences(id) on delete restrict,
  source_text_snapshot text not null,
  translation_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (student_id, sentence_id)
);

create table if not exists public.ready_word_cache (
  normalized_word text primary key,
  meaning text not null,
  updated_at timestamptz not null default now()
);

create index if not exists ready_word_lookup_student_created_idx on public.ready_word_lookup_events(student_id, created_at desc);
create index if not exists ready_translation_view_student_created_idx on public.ready_sentence_translation_view_events(student_id, created_at desc);
create index if not exists ready_saved_words_student_created_idx on public.ready_saved_words(student_id, created_at desc);
create index if not exists ready_saved_sentences_student_created_idx on public.ready_saved_sentences(student_id, created_at desc);

alter table public.ready_word_lookup_events enable row level security;
alter table public.ready_saved_words enable row level security;
alter table public.ready_sentence_translation_view_events enable row level security;
alter table public.ready_saved_sentences enable row level security;
alter table public.ready_word_cache enable row level security;
revoke all on public.ready_word_lookup_events, public.ready_saved_words,
  public.ready_sentence_translation_view_events, public.ready_saved_sentences,
  public.ready_word_cache from anon, authenticated;
grant all on public.ready_word_lookup_events, public.ready_saved_words,
  public.ready_sentence_translation_view_events, public.ready_saved_sentences,
  public.ready_word_cache to service_role;
