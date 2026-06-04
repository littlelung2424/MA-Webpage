alter table public.intake_submissions
  add column if not exists process_involvement text;
