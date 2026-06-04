alter table public.intake_submissions
  add column if not exists tools_or_systems jsonb not null default '[]'::jsonb;
