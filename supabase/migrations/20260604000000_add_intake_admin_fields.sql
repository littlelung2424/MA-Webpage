alter table public.intake_submissions
  add column if not exists status text not null default 'New',
  add column if not exists internal_notes text;

alter table public.intake_submissions
  drop constraint if exists intake_submissions_status_check;

alter table public.intake_submissions
  add constraint intake_submissions_status_check
  check (status in ('New', 'Reviewing', 'Done'));
