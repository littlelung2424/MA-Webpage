# Scheduled intake email notifications

This workflow calls the existing production worker at `POST https://missionatlasxd.com/api/internal/intake-notifications`. It does not send email itself, change intake records, or bypass the worker's safeguards. The worker processes **at most one** eligible queued notification per invocation.

## Setup (required before merging)

1. In Vercel, confirm the production environment has `INTAKE_NOTIFICATIONS_ENABLED=true` and a working `CRON_SECRET` (at least 32 characters). A production redeployment is required after changing Vercel environment variables.
2. In the **MA-Webpage** GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Name the secret `MA_INTAKE_CRON_SECRET` and set its value to **the same existing Vercel production `CRON_SECRET`**. Never paste it into code, logs, pull requests, or chat.
4. Review and merge this PR. Scheduled workflows only run from the default branch.

## Test and operate

- In **Actions → Process intake email notifications**, select **Run workflow** on the default branch. The run should succeed when the worker is enabled, including when no notification is pending.
- Check **Supabase → My Apps → SQL Editor** for the outbox state:

  ```sql
  select submission_id, status, attempts, created_at, accepted_at, last_code
  from public.intake_notification_outbox
  order by created_at desc
  limit 20;
  ```

- Verify actual delivery in Resend and the destination inbox. `accepted` means Resend accepted the email; it does not guarantee inbox delivery.
- The workflow logs only an HTTP status on errors and a generic success message, not the response body or bearer token.
- To stop automated requests, disable the workflow in the GitHub Actions UI. To stop email sending immediately, set `INTAKE_NOTIFICATIONS_ENABLED=false` in Vercel Production and redeploy; this also disables manual worker sends.

## Limits and reliability

GitHub scheduled workflows are **best effort**: executions may be delayed or dropped, especially under load, and inactive public repositories can have scheduled workflows disabled. This schedule uses minute 3 then every five minutes to avoid the busiest top-of-hour minute. The scheduler does not guarantee five-minute delivery.

Each run processes **one** notification. If incoming submissions exceed the processing rate, the backlog can grow. A non-200 HTTP response, missing secret, disabled worker, or malformed worker response fails the job. The existing database outbox retains pending jobs for a later run; consult `docs/intake-notifications.md` for reconciliation procedures. Do not repeatedly rerun uncertain sends without reviewing their state.

No Vercel Cron or other scheduler should be enabled concurrently without an explicit operational decision.
