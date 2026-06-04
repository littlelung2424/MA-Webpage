-- Existing Supabase projects may already have applied the original intake table
-- migration before service_role grants were added there. Keep this follow-up
-- migration separate so Supabase will actually apply the grants on deploy.
grant usage on schema public to service_role;
grant select, insert, update on table public.intake_submissions to service_role;
grant usage, select on sequence public.intake_submissions_id_seq to service_role;
