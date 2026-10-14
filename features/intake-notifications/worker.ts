import { timingSafeEqual } from "node:crypto";
import {
  getSupabaseConfig,
  supabaseHeaders,
  supabaseReadinessError,
} from "../../lib/intakeSupabase";

export const RECIPIENT = "info@missionatlasxd.com";
type Snapshot = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  tools_or_systems: string[];
  process_involvement: string | null;
  task: string | null;
  success: string | null;
  anything_else: string | null;
  current_process_filenames: string[];
  desired_output_filenames: string[];
};
export type Job = {
  id: string;
  submission_id: string;
  idempotency_key: string;
  claim_token: string;
  payload: Snapshot;
};
export type Outcome = {
  status: "accepted" | "retry" | "failed" | "reconciliation";
  code: string;
  providerId?: string;
};

export function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Conservative mailbox syntax: no display names, control characters, or header injection.
export function validMailbox(value: string) {
  return (
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      value,
    )
  );
}

export function emailBody(job: Job, from: string) {
  const p = job.payload;
  const text = [
    "New Mission Atlas xD intake submission",
    `Submission ID: ${p.id}`,
    `Submitted at (UTC): ${new Date(p.created_at).toISOString()}`,
    `Name: ${p.name}`,
    `Email: ${p.email}`,
    `Tools or systems: ${p.tools_or_systems.join(", ") || "None supplied"}`,
    `Process involvement: ${p.process_involvement || "None supplied"}`,
    `Current task:\n${p.task || "None supplied"}`,
    `Desired outcome:\n${p.success || "None supplied"}`,
    `Anything else:\n${p.anything_else || "None supplied"}`,
    `Current process files: ${p.current_process_filenames.join(", ") || "None"}`,
    `Desired output files: ${p.desired_output_filenames.join(", ") || "None"}`,
    "Review private attachments at https://missionatlasxd.com/admin/intake (admin sign-in required).",
  ].join("\n\n");
  return {
    from,
    to: [RECIPIENT],
    subject: `Mission Atlas xD intake #${p.id}`,
    text,
    ...(validMailbox(p.email) ? { reply_to: p.email } : {}),
  };
}

export async function sendNotification(
  job: Job,
  config: { apiKey: string; from: string },
  transport: typeof fetch = fetch,
): Promise<Outcome> {
  // Render before the network call: invalid stored data is a definite local failure.
  let body: ReturnType<typeof emailBody>;
  try {
    body = emailBody(job, config.from);
  } catch {
    return { status: "failed", code: "invalid_snapshot" };
  }
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.idempotency_key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    const data = (await response.json()) as { id?: unknown; name?: unknown };
    if (response.ok && typeof data.id === "string" && data.id.length > 0) {
      return {
        status: "accepted",
        code: "provider_accepted",
        providerId: data.id,
      };
    }
    // Only documented explicit rejections can be retried automatically. Never retry
    // 409s, 5xx, malformed bodies, timeouts, or connection failures: acceptance is unknown.
    const name = typeof data.name === "string" ? data.name : "unknown";
    if (
      response.status === 429 &&
      [
        "rate_limit_exceeded",
        "daily_quota_exceeded",
        "monthly_quota_exceeded",
      ].includes(name)
    ) {
      return { status: "retry", code: name };
    }
    if (
      [400, 401, 403, 422].includes(response.status) &&
      [
        "validation_error",
        "missing_api_key",
        "invalid_api_key",
        "restricted_api_key",
        "invalid_from_address",
        "missing_required_field",
        "invalid_parameter",
      ].includes(name)
    ) {
      return { status: "failed", code: name };
    }
    return {
      status: "reconciliation",
      code: `provider_http_${response.status}`,
    };
  } catch {
    return { status: "reconciliation", code: "provider_result_unknown" };
  }
}

export async function notificationRpc<T>(
  name: string,
  body: object,
  transport: typeof fetch = fetch,
): Promise<T> {
  const { supabaseUrl } = getSupabaseConfig();
  const response = await transport(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Notification RPC ${name} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function processNotification(deps: {
  claim: () => Promise<Job[]>;
  send: (job: Job) => Promise<Outcome>;
  finish: (job: Job, outcome: Outcome) => Promise<boolean>;
}) {
  const [job] = await deps.claim();
  if (!job) return { processed: 0 };
  const outcome = await deps.send(job);
  if (!(await deps.finish(job, outcome)))
    throw new Error("Notification claim was lost");
  return { processed: 1, status: outcome.status };
}

export async function handleNotificationWorker(request: Request) {
  if (!authorized(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.INTAKE_NOTIFICATIONS_ENABLED !== "true") {
    return Response.json({ enabled: false, processed: 0 });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INTAKE_NOTIFICATION_FROM?.trim();
  if (!apiKey || !from || !validMailbox(from) || supabaseReadinessError()) {
    return Response.json(
      { error: "Notification worker is not configured" },
      { status: 503 },
    );
  }
  try {
    const result = await processNotification({
      claim: () => notificationRpc<Job[]>("claim_intake_notification", {}),
      send: (job) => sendNotification(job, { apiKey, from }),
      finish: (job, outcome) =>
        notificationRpc<boolean>("finish_intake_notification", {
          p_id: job.id,
          p_claim_token: job.claim_token,
          p_status: outcome.status,
          p_code: outcome.code,
          p_provider_id: outcome.providerId ?? null,
        }),
    });
    console.info("Intake notification worker", result);
    return Response.json(result);
  } catch {
    // A failed completion write leaves processing durable; lease expiry moves it
    // to reconciliation. Do not send again even if Resend accepted the email.
    console.error(
      "Intake notification worker failed; inspect outbox for reconciliation",
    );
    return Response.json(
      { error: "Notification worker failed" },
      { status: 500 },
    );
  }
}
