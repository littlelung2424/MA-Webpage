-- Apply before deploying the RPC caller. No scheduler or email is activated here.
begin;

create table public.intake_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  submission_table text not null,
  submission_id text not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in
    ('pending', 'processing', 'retry', 'accepted', 'failed', 'reconciliation', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  provider_id text,
  last_code text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb,
  unique (submission_table, submission_id)
);
create index intake_notification_due on public.intake_notification_outbox(next_attempt_at, created_at)
  where status in ('pending', 'retry');
create index intake_notification_leases on public.intake_notification_outbox(claimed_at)
  where status = 'processing';
alter table public.intake_notification_outbox enable row level security;
revoke all on public.intake_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.intake_notification_outbox to service_role;

-- Invoker privileges only. The existing server service_role is the only API caller.
-- Identifier quoting preserves SUPABASE_INTAKE_TABLE without SQL interpolation risks.
create function public.submit_intake_with_notification(p_submission jsonb, p_table text default 'intake_submissions')
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_id text;
  v_created_at timestamptz;
  v_payload jsonb;
begin
  execute format('insert into public.%I
    (name,email,tools_or_systems,process_involvement,task,success,anything_else,
     current_process_files,desired_output_files,status,internal_notes)
    values ($1->>''name'', $1->>''email'', coalesce($1->''tools_or_systems'',''[]''::jsonb),
      $1->>''process_involvement'', $1->>''task'', $1->>''success'', $1->>''anything_else'',
      coalesce($1->''current_process_files'',''[]''::jsonb),
      coalesce($1->''desired_output_files'',''[]''::jsonb), ''New'', null)
    returning id::text, created_at', p_table)
    into v_id, v_created_at using p_submission;

  v_payload := jsonb_build_object(
    'id', v_id, 'created_at', v_created_at,
    'name', p_submission->>'name', 'email', p_submission->>'email',
    'tools_or_systems', coalesce(p_submission->'tools_or_systems', '[]'::jsonb),
    'process_involvement', p_submission->>'process_involvement',
    'task', p_submission->>'task', 'success', p_submission->>'success',
    'anything_else', p_submission->>'anything_else',
    'current_process_filenames', coalesce((select jsonb_agg(f->>'name')
      from jsonb_array_elements(p_submission->'current_process_files') f), '[]'::jsonb),
    'desired_output_filenames', coalesce((select jsonb_agg(f->>'name')
      from jsonb_array_elements(p_submission->'desired_output_files') f), '[]'::jsonb)
  );
  insert into public.intake_notification_outbox(submission_table,submission_id,idempotency_key,payload)
    values (p_table,v_id,'mission-atlas-intake/' || p_table || '/' || v_id,v_payload);
  return v_id;
end;
$$;

-- One row per invocation keeps the HTTP worker comfortably within its 60s budget.
create function public.claim_intake_notification()
returns setof public.intake_notification_outbox
language plpgsql security invoker set search_path = '' as $$
begin
  -- Never reclaim an interrupted send. It could already have been accepted.
  with expired as (
    select id from public.intake_notification_outbox
    where status = 'processing' and claimed_at < now() - interval '5 minutes'
    for update skip locked
  )
  update public.intake_notification_outbox o
    set status = 'reconciliation', last_code = 'worker_lease_expired', updated_at = now(),
      claim_token = null,
      history = history || jsonb_build_array(jsonb_build_object('at',now(),'status','reconciliation','code','worker_lease_expired'))
    from expired where o.id = expired.id;

  return query
    with due as (
      select id from public.intake_notification_outbox
      where status in ('pending','retry') and next_attempt_at <= now() and attempts < max_attempts
      order by next_attempt_at, created_at, id limit 1 for update skip locked
    )
    update public.intake_notification_outbox o
      set status = 'processing', attempts = attempts + 1,
        claim_token = gen_random_uuid(), claimed_at = now(), updated_at = now()
      from due where o.id = due.id returning o.*;
end;
$$;

create function public.finish_intake_notification(
  p_id uuid, p_claim_token uuid, p_status text, p_code text, p_provider_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.intake_notification_outbox%rowtype;
  v_status text;
begin
  if p_status not in ('accepted','retry','failed','reconciliation') or p_status is null then
    raise exception 'Invalid notification outcome';
  end if;
  if p_status = 'accepted' and coalesce(p_provider_id,'') = '' then
    raise exception 'Provider ID is required for acceptance';
  end if;
  select * into v_row from public.intake_notification_outbox
    where id = p_id and claim_token = p_claim_token and status = 'processing' for update;
  if not found then return false; end if;
  v_status := case when p_status = 'retry' and v_row.attempts >= v_row.max_attempts then 'failed' else p_status end;
  update public.intake_notification_outbox set
    status = v_status, last_code = p_code, provider_id = p_provider_id,
    accepted_at = case when v_status = 'accepted' then now() else null end,
    next_attempt_at = now() + case v_row.attempts
      when 1 then interval '1 minute' when 2 then interval '5 minutes'
      when 3 then interval '30 minutes' else interval '2 hours' end,
    claim_token = null, updated_at = now(),
    history = history || jsonb_build_array(jsonb_build_object(
      'at',now(),'attempt',v_row.attempts,'status',v_status,'code',p_code,'provider_id',p_provider_id))
    where id = p_id;
  return true;
end;
$$;

-- Operator-only recovery, after checking Resend and stopping any in-flight worker.
-- Evidence is mandatory and retained. Accepted jobs can never be requeued.
create function public.resolve_intake_notification(
  p_id uuid, p_status text, p_evidence text, p_provider_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_status is null or p_status not in ('accepted','retry','cancelled')
    or length(trim(coalesce(p_evidence,''))) < 10 then
    raise exception 'Resolution requires a valid outcome and reconciliation evidence';
  end if;
  if p_status = 'accepted' and coalesce(p_provider_id,'') = '' then
    raise exception 'Provider ID is required for acceptance';
  end if;
  update public.intake_notification_outbox set
    status = p_status, provider_id = p_provider_id, claim_token = null,
    accepted_at = case when p_status = 'accepted' then now() else null end,
    max_attempts = case when p_status = 'retry' then attempts + 5 else max_attempts end,
    next_attempt_at = now(), updated_at = now(), last_code = 'operator_resolution',
    history = history || jsonb_build_array(jsonb_build_object(
      'at',now(),'status',p_status,'evidence',p_evidence,'provider_id',p_provider_id))
    where id = p_id and status in ('failed','reconciliation','pending','retry');
  return found;
end;
$$;

-- Keep existing admin deletion semantics: erase the queued snapshot too.
create function public.delete_intake_notification()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.intake_notification_outbox
    where submission_table = tg_table_name and submission_id = old.id::text;
  return old;
end;
$$;
create trigger delete_intake_notification after delete on public.intake_submissions
  for each row execute function public.delete_intake_notification();

revoke all on function public.submit_intake_with_notification(jsonb,text) from public, anon, authenticated;
revoke all on function public.claim_intake_notification() from public, anon, authenticated;
revoke all on function public.finish_intake_notification(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.resolve_intake_notification(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.delete_intake_notification() from public, anon, authenticated;
grant execute on function public.submit_intake_with_notification(jsonb,text) to service_role;
grant execute on function public.claim_intake_notification() to service_role;
grant execute on function public.finish_intake_notification(uuid,uuid,text,text,text) to service_role;
grant execute on function public.resolve_intake_notification(uuid,text,text,text) to service_role;
grant execute on function public.delete_intake_notification() to service_role;

commit;
