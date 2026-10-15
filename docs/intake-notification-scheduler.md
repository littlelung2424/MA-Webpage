# Intake notification scheduler

The workflow at `.github/workflows/intake-notifications.yml` invokes the existing authenticated Vercel worker approximately every five minutes. Each request processes at most one queued notification. GitHub Actions does not send email itself.

## Setup

1. Confirm Vercel Production has `INTAKE_NOTIFICATIONS_ENABLED=true` and a valid `CRON_SECRET` (at least 32 characters). Redeploy after changing Vercel environment variables.
2. In MA-Webpage, open **Settings > Secrets and variables > Actions > New repository secret**.
3. Create `MA_INTAKE_CRON_SECRET` using the exact existing Vercel Production `CRON_SECRET`. Do not share or commit secret values.
4. Review and merge the PR. Schedules only run from the default branch.

## Testing

In **Actions > Process intake email notifications**, choose **Run workflow** on the default branch. A successful run reports either zero queued items or one processed item. The run summary includes only the processed count and status; it never prints the response body or form contents.

To inspect the outbox in Supabase My Apps SQL Editor:

```sql
select submission_id, status, attempts, created_at, accepted_at, last_code
from public.intake_notification_outbox
order by created_at desc
limit 20;
```

Confirm actual delivery in Resend and the destination inbox. An `accepted` status means the provider accepted the email, not that inbox delivery is guaranteed.

## Outcomes and troubleshooting

- `processed=0`: no eligible notification; successful run.
- `accepted`: provider accepted one email; successful run.
- `retry`: retryable provider rejection; workflow succeeds and outbox controls future retry eligibility.
- `failed`: definite provider/local failure; workflow fails. Inspect the outbox's `last_code` and Vercel logs.
- `reconciliation`: provider acceptance is uncertain; workflow fails. **Do not manually resend** until the outbox and provider state are reconciled.
- HTTP 401: check that the GitHub Actions secret matches the Vercel secret. HTTP 403: check endpoint access/deployment protection. HTTP 503: check worker configuration. Network failures, disabled worker, and malformed responses also fail the run.

A failed workflow does not prove the email was not sent. The workflow only calls the existing worker and does not automatically resend an uncertain delivery.

## Operating limits

GitHub schedules are best-effort and can be delayed or skipped. Runs are offset from the top of the hour; delivery within five minutes is not guaranteed. Each invocation processes only one notification, so a backlog can grow if submissions arrive faster. Concurrent workflow runs are serialized.

To stop scheduled invocations, disable the workflow in GitHub Actions. To stop sending through both scheduled and manual invocations, set `INTAKE_NOTIFICATIONS_ENABLED=false` in Vercel Production and redeploy. Scheduled runs left enabled will report failure while the worker is disabled.

Do not enable a second scheduler without reviewing potential duplicate scheduling and operating procedures.
