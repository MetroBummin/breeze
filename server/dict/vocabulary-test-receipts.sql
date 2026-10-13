-- LOCAL REVIEW PROPOSAL ONLY. Not a migration and never applied to production.
-- Promote through the normal migration process before enabling the server gate.
-- No prompt, source text, word, reference meaning or typed answer is persisted.
create table public.vocabulary_test_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id text not null check (length(batch_id) between 1 and 180),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','complete')),
  answer jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id,batch_id)
);
alter table public.vocabulary_test_receipts enable row level security;
revoke all on public.vocabulary_test_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.vocabulary_test_receipts to service_role;

create function public.vocabulary_test_claim(p_user uuid,p_batch text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.vocabulary_test_receipts%rowtype; quota jsonb;
begin
  if p_user is null or p_batch is null or length(p_batch) not between 1 and 180
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid test receipt'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test:'||p_user::text||':'||p_batch,0));
  select * into prior from public.vocabulary_test_receipts where user_id=p_user and batch_id=p_batch;
  if found then
    if prior.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status',prior.status,'answer',prior.answer);
  end if;
  -- Existing account quota, reserved once before a provider call (10 answers).
  quota:=public.take_ai_quota(p_user,3000,1);
  if not coalesce((quota->>'ok')::boolean,false) then return jsonb_build_object('status','quota_exceeded'); end if;
  insert into public.vocabulary_test_receipts(user_id,batch_id,fingerprint) values(p_user,p_batch,p_fingerprint);
  return jsonb_build_object('status','claimed');
end $$;
create function public.vocabulary_test_finish(p_user uuid,p_batch text,p_fingerprint text,p_answer jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.vocabulary_test_receipts%rowtype;
begin
  if p_answer is null or jsonb_typeof(p_answer)<>'object' or jsonb_typeof(p_answer->'results')<>'array'
    or jsonb_array_length(p_answer->'results') not between 1 and 10 or octet_length(p_answer::text)>16000 then raise exception 'invalid test answer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test:'||p_user::text||':'||p_batch,0));
  select * into prior from public.vocabulary_test_receipts where user_id=p_user and batch_id=p_batch;
  if not found or prior.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
  if prior.status='pending' then
    update public.vocabulary_test_receipts set status='complete',answer=p_answer where user_id=p_user and batch_id=p_batch;
    return jsonb_build_object('status','complete','answer',p_answer);
  end if;
  return jsonb_build_object('status','complete','answer',prior.answer);
end $$;
revoke all on function public.vocabulary_test_claim(uuid,text,text) from public,anon,authenticated;
revoke all on function public.vocabulary_test_finish(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vocabulary_test_claim(uuid,text,text) to service_role;
grant execute on function public.vocabulary_test_finish(uuid,text,text,jsonb) to service_role;
-- A pending receipt is intentionally never automatically reclaimed. After an
-- interrupted paid request, human review is safer than an unprovable second bill.
