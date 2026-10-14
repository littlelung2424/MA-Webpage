# Intake notification setup and recovery

## Architecture and inspected dependencies

The intake implementation is in this repository: `app/intake/page.tsx` and `features/intake/components/IntakeForm.tsx` submit multipart data to `app/api/intake/route.ts`. That handler validates the existing fields and files, uploads to private Vercel Blob, and calls `saveIntakeSubmissionToSupabase`. No separate intake repository or database webhook is needed. The connected Vercel project is `ma-webpage`, uses Node 24, and includes `missionatlasxd.com`; its non-custom domains have Vercel Authentication protection. Live database schema/credentials and Resend ownership must still be checked by the operator before deployment.

The save helper now calls `public.submit_intake_with_notification` through Supabase REST. Its transaction inserts the intake record and a unique outbox row together. Failure of either insert rolls back both. No email provider is called from the submission request, so email errors cannot make a saved intake appear unsuccessful. The form, `{ok:true}` response, private upload behavior, and admin authentication remain unchanged. Uploaded Blob objects are outside the database transaction; an unsuccessful database insert can leave an orphaned upload, as before.

The worker `/api/internal/intake-notifications` supports GET (Vercel Cron) and POST (manual/external scheduler). Both require a bearer secret of at least 32 characters. It exits before database access unless `INTAKE_NOTIFICATIONS_ENABLED` is exactly `true`. Each invocation atomically claims at most one job using `FOR UPDATE SKIP LOCKED`, increments attempts and assigns a fresh UUID claim token. Concurrent invocations cannot send the same claim. Completion is fenced by the token and `processing` state.

Resend receives plain text with the submission ID, original database timestamp in UTC, all intake fields, filenames in both upload groups, and a fixed authenticated admin URL. There are no file bodies, Blob paths, signed URLs or internal admin notes in the notification snapshot/email. Reply-To is added only for a conservatively validated mailbox; invalid values are omitted. The recipient is fixed in server code to `info@missionatlasxd.com`.

## States and failure handling

| State | Meaning and next action |
| --- | --- |
| `pending` | Saved atomically, eligible for a worker after activation. |
| `processing` | Claimed by one worker; five-minute lease. |
| `retry` | Resend explicitly rejected for a documented rate/quota limit. Automatically eligible after backoff. |
| `accepted` | Resend returned a provider message ID, or an operator confirmed acceptance. Terminal; does not assert inbox delivery. |
| `failed` | Definite local/provider rejection or five attempts exhausted. Fix cause and explicitly requeue. |
| `reconciliation` | Acceptance is uncertain. Never automatically resent. |
| `cancelled` | Operator intentionally suppressed the notification. Terminal. |

Backoff is 1 minute, 5 minutes, 30 minutes, then 2 hours, capped at five attempts per retry cycle. Only HTTP 429 with Resend's `rate_limit_exceeded`, `daily_quota_exceeded`, or `monthly_quota_exceeded` automatically retries. Known validation/auth rejection codes stop in `failed`. All other outcomes (including 409, 5xx, malformed response, missing success ID, network failure and timeout) require reconciliation. This conservative handling also applies when Resend accepts an email but writing its result fails: the durable `processing` lease eventually expires into `reconciliation` on a later enabled worker invocation.

The provider key is `mission-atlas-intake/<table>/<submission-id>`, unchanged across claim tokens and retries. IDs are stored as text so bigint precision is preserved. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); that is not a permanent deduplication guarantee. Durable terminal/uncertain states prevent automatic re-sends after that window. Separate form submissions receive separate IDs and notifications, even if a person submits the same content twice. Exactly-once inbox delivery cannot be guaranteed across a network boundary.

## Required manual setup, in order

No production migration, deployment, live email, or scheduler activation is part of preparing this PR.

1. **Review and approve the PR and release separately.** Check the target Vercel/Supabase project and existing table schema. Use an isolated development Supabase project for verification; do not give a PR preview production database credentials. Existing elevated Supabase and private Blob credentials stay server-side.
2. **Apply database prerequisites before the application release.** Apply existing migrations through `20260604050000_add_process_involvement_to_intake_submissions.sql`, then `supabase/migrations/20261010141919_intake_notification_outbox.sql` to the approved environment. The new migration creates RLS-protected outbox storage and SECURITY INVOKER RPCs, with execution/table access limited to `service_role`. Check Data API exposes the public RPCs to the elevated server key but not anonymous/authenticated users. All SQL migration tests run locally; production differences still require a staging check.
3. **Check custom table configuration.** If `SUPABASE_INTAKE_TABLE` differs from `intake_submissions`, its public-schema table must have the same intake columns/defaults and elevated grants. The RPC quotes its identifier and supports that setting. Attach the deletion trigger below to the actual table too, so existing admin deletion purges its queued snapshot. Do this in a reviewed migration before deployment:

   ```sql
   -- Replace custom_intake with your actual configured table identifier.
   create trigger delete_intake_notification after delete on public.custom_intake
     for each row execute function public.delete_intake_notification();
   ```

4. **Configure Resend.** Verify ownership of `missionatlasxd.com` (or an approved sending subdomain), add the exact DNS verification/DKIM/SPF records Resend provides, and confirm verification. Create a sending API key restricted to the verified domain where supported. Choose a bare sender mailbox such as `intake@missionatlasxd.com`. Do not use an end user's address as From. No Resend webhook is required. Consult [domain verification](https://resend.com/docs/dashboard/domains/introduction) and [sending API](https://resend.com/docs/api-reference/emails/send-email).
5. **Set Vercel server environment variables** on the correct environment for project `ma-webpage`. Preserve `SUPABASE_URL`, an elevated `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`, optional `SUPABASE_INTAKE_TABLE`, Blob configuration, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. Add these variables:

   | Variable | Value |
   | --- | --- |
   | `INTAKE_NOTIFICATIONS_ENABLED` | `false` until explicit activation approval; unset also disables. |
   | `RESEND_API_KEY` | Secret Resend sending key. |
   | `INTAKE_NOTIFICATION_FROM` | Verified bare mailbox, e.g. `intake@missionatlasxd.com`. |
   | `CRON_SECRET` | Secret with at least 32 random characters. |

   Keep every credential out of `NEXT_PUBLIC_*`. Scope secrets to the approved environment; don't copy production keys into previews. A newly approved deployment is required for environment changes to take effect. For local setup, copy `.env.example` to `.env.local` and use development credentials. `vercel env pull` is an alternative for an already-linked development environment, but overwrites that file.
6. **Verify with sending disabled.** In staging, submit the form and confirm one intake plus one `pending` outbox row. Confirm normal form success, admin Basic Auth, and private attachment access. Verify a bearer-authenticated worker request returns `{enabled:false,processed:0}`; unauthorized requests return 401. Tests use mocks and a disposable local Postgres cluster, never real Resend calls. Before activation, any live delivery test requires explicit approval; Resend testing addresses must not replace the production recipient in committed code.
7. **Review the disabled-period backlog.** Existing intake rows are not backfilled. New submissions after the RPC release accumulate `pending` jobs even while sending is disabled; enabling later will send those unless cancelled first. Review and cancel unwanted jobs with the recovery RPC below. For a custom table, verify deletion-trigger coverage before enabling.
8. **After explicit production approval**, set `INTAKE_NOTIFICATIONS_ENABLED=true`, release the approved build/configuration, and enable one scheduler. For Vercel Cron, add this to the existing `vercel.json` in a separately approved release (it is intentionally absent from this PR):

   ```json
   { "crons": [{ "path": "/api/internal/intake-notifications", "schedule": "* * * * *" }] }
   ```

   Keep the other existing Vercel configuration. Confirm the plan supports a per-minute schedule (Hobby has tighter limits). Vercel sends `Authorization: Bearer <CRON_SECRET>`. This processes one notification per minute; check backlog size against that throughput. Alternatively configure an external scheduler to POST the production custom-domain endpoint once a minute with the same bearer header and a 60-second request timeout. Avoid caching. Preview URLs may require a separate Vercel Deployment Protection bypass; don't turn protection off. Do not enable both schedulers without a throughput reason, although atomic claims tolerate overlap. See [Vercel Cron configuration and authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
9. **Monitor.** Check scheduler HTTP failures and safe worker logs, Resend acceptance/bounces in its dashboard, due backlog age, `failed`, `reconciliation`, and stale `processing` rows. Assign an operator to review failures; this PR does not create another email alert channel or automatically reconcile provider history. A scheduler outage delays notifications until restored; it does not affect saved submissions.

## Operator recovery

Use the Supabase SQL Editor as an authorized database administrator, or call the recovery RPC with the existing elevated server key. Never expose this key in a browser. Disable the scheduler and sending, allow current worker invocations to finish, and confirm the original send is no longer in flight before requeueing an uncertain job. After five minutes an enabled worker invocation parks expired claims; disabling sending intentionally stops all worker database operations, including that sweep.

```sql
select id, submission_id, submission_table, status, attempts, next_attempt_at,
       claimed_at, provider_id, last_code, history
from public.intake_notification_outbox
where status in ('failed','reconciliation','processing','pending','retry')
order by created_at;
```

For `reconciliation`, check Resend's dashboard/logs with the recipient, submission ID in subject, request timeframe and stable idempotency key. If you find an accepted message, record its ID. If acceptance cannot be determined, leave the job parked and escalate to Resend; absence from a search alone is not proof of non-acceptance. Do not resend just because 24 hours elapsed. Confirming non-acceptance before requeue is an operator responsibility, and evidence is stored in the audit history.

```sql
-- Replace UUID and evidence/provider ID with actual verified values.
select public.resolve_intake_notification(
  '00000000-0000-0000-0000-000000000000', 'accepted',
  'Resend dashboard confirms acceptance; investigation reference ...', 'resend-message-id');

-- Only after definite non-acceptance or a known rejection, with the cause fixed.
select public.resolve_intake_notification(
  '00000000-0000-0000-0000-000000000000', 'retry',
  'Confirmed provider did not accept; original worker stopped; investigation ...');

-- Suppress an unwanted disabled-period job without sending.
select public.resolve_intake_notification(
  '00000000-0000-0000-0000-000000000000', 'cancelled',
  'Operator approved skipping this disabled-period notification');
```

The RPC returns false when the job is no longer eligible. It cannot requeue accepted/cancelled or currently processing jobs; history and total attempts survive recovery. Retry grants a further five attempts and retains the same idempotency key. Never change the key to work around a conflict. Retry with a changed From can produce an idempotency payload conflict; reconcile rather than changing the key. Restore the approved scheduler/configuration after recovery.

The outbox contains personal intake fields and must follow the same retention/access policy as intake records. Deleting through the existing admin removes the outbox snapshot via the database deletion trigger (custom tables need the trigger above). It cannot recall a notification already accepted or stop a worker that already holds a copy. No private attachment bytes are stored in the outbox. Terminal history should be retained for deduplication while its intake record remains; don't delete and recreate outbox jobs to retry.

## Verification and rollback

Use Node 24 and `npm ci`, then `npm test`, `npm run lint`, and `npm run build`. Tests boot real Postgres 17 from a pinned development-only embedded package on a temporary local port. No Docker or production database is needed. Run as a regular user (Postgres refuses root). Test data/logs remain under ignored `work/notification-db-*`; the server shuts down gracefully via `pg_ctl`.

Tests cover transactional rollback on outbox failure, field snapshots and private-file exclusion, custom table support, duplicate job uniqueness, two-connection SKIP LOCKED behavior and simultaneous claims, claim fencing, retry timing/exhaustion/operator recovery, abandoned lease reconciliation, access grants/RLS, provider acceptance/rejection/ambiguity, disabled/auth configuration, and the actual submission endpoint's single RPC/no-email path.

To halt sending, disable the scheduler and set the flag to false in a new approved deployment; in-flight sends may complete. Keep the migration and RPCs when rolling back application code: the old submission handler can still save intake normally, but it will not enqueue notifications. Retain outbox data for investigation. Do not drop the RPC while the new application still calls it, and do not backfill existing submissions or activate delivery without separate approval.
