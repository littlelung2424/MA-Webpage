import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorized,
  emailBody,
  handleNotificationWorker,
  processNotification,
  sendNotification,
  validMailbox,
  type Job,
} from "../features/intake-notifications/worker";
import { POST } from "../app/api/intake/route";

const job: Job = {
  id: "00000000-0000-4000-8000-000000000001",
  submission_id: "9007199254740993",
  claim_token: "00000000-0000-4000-8000-000000000002",
  idempotency_key: "mission-atlas-intake/intake_submissions/9007199254740993",
  payload: {
    id: "9007199254740993",
    created_at: "2026-10-10T12:00:00Z",
    name: "Test User",
    email: "person@example.com",
    tools_or_systems: ["Excel"],
    process_involvement: "Daily",
    task: "Prepare orders",
    success: "Less manual work",
    anything_else: "Extra context",
    current_process_filenames: ["current.csv"],
    desired_output_filenames: ["desired.png"],
  },
};
const config = { from: "intake@missionatlasxd.com", apiKey: "fake-key" };
const transport = (response: Response) =>
  (async () => response) as typeof fetch;

test("notification includes all intake fields, UTC timestamp and filenames only", () => {
  const body = emailBody(job, config.from);
  assert.deepEqual(body.to, ["info@missionatlasxd.com"]);
  assert.equal(body.reply_to, "person@example.com");
  for (const expected of [
    "9007199254740993",
    "2026-10-10T12:00:00.000Z",
    "Test User",
    "person@example.com",
    "Excel",
    "Daily",
    "Prepare orders",
    "Less manual work",
    "Extra context",
    "current.csv",
    "desired.png",
  ])
    assert.ok(body.text.includes(expected));
  assert.ok(!("attachments" in body));
  assert.ok(!body.text.includes("blob.vercel-storage.com"));
});
test("Reply-To rejects header injection and malformed mailboxes", () => {
  for (const email of [
    "a@example.com\r\nBcc: evil@example.com",
    "a@b",
    "A <a@example.com>",
    "a@-example.com",
    " a@example.com",
  ]) {
    assert.equal(validMailbox(email), false);
    assert.ok(
      !(
        "reply_to" in
        emailBody({ ...job, payload: { ...job.payload, email } }, config.from)
      ),
    );
  }
});
test("provider acceptance uses the stable submission key, never the claim token", async () => {
  const requests: RequestInit[] = [];
  const mock = (async (_url, init) => {
    requests.push(init!);
    return Response.json({ id: "resend-123" });
  }) as typeof fetch;
  assert.deepEqual(await sendNotification(job, config, mock), {
    status: "accepted",
    code: "provider_accepted",
    providerId: "resend-123",
  });
  await sendNotification(
    { ...job, claim_token: "different-token" },
    config,
    mock,
  );
  assert.equal(
    (requests[0].headers as Record<string, string>)["Idempotency-Key"],
    job.idempotency_key,
  );
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.deepEqual(requests[0].headers, requests[1].headers);
});
test("only documented explicit throttling rejections are automatically retried", async () => {
  for (const name of [
    "rate_limit_exceeded",
    "daily_quota_exceeded",
    "monthly_quota_exceeded",
  ]) {
    assert.equal(
      (
        await sendNotification(
          job,
          config,
          transport(Response.json({ name }, { status: 429 })),
        )
      ).status,
      "retry",
    );
  }
  assert.equal(
    (
      await sendNotification(
        job,
        config,
        transport(Response.json({ name: "invalid_api_key" }, { status: 401 })),
      )
    ).status,
    "failed",
  );
});
test("ambiguous responses and network errors require reconciliation with no resend", async () => {
  for (const response of [
    Response.json({ id: "maybe" }, { status: 500 }),
    Response.json({ name: "concurrent_idempotent_requests" }, { status: 409 }),
    Response.json({}, { status: 200 }),
    new Response("not-json", { status: 429 }),
    Response.json({ name: "unknown" }, { status: 429 }),
  ]) {
    let calls = 0;
    const result = await sendNotification(job, config, (async () => {
      calls++;
      return response;
    }) as typeof fetch);
    assert.equal(result.status, "reconciliation");
    assert.equal(calls, 1);
  }
  for (const error of [
    new Error("socket closed"),
    new DOMException("Timed out", "TimeoutError"),
  ]) {
    assert.equal(
      (
        await sendNotification(job, config, (async () => {
          throw error;
        }) as typeof fetch)
      ).status,
      "reconciliation",
    );
  }
});
test("failed completion never triggers a second provider call", async () => {
  let sends = 0;
  await assert.rejects(
    processNotification({
      claim: async () => [job],
      send: async () => {
        sends++;
        return { status: "accepted", code: "ok", providerId: "123" };
      },
      finish: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/,
  );
  assert.equal(sends, 1);
  await assert.rejects(
    processNotification({
      claim: async () => [job],
      send: async () => ({ status: "accepted", code: "ok", providerId: "123" }),
      finish: async () => false,
    }),
    /claim was lost/,
  );
});
test("idle worker does not send", async () => {
  assert.deepEqual(
    await processNotification({
      claim: async () => [],
      send: async () => {
        throw Error("unexpected send");
      },
      finish: async () => false,
    }),
    { processed: 0 },
  );
});
test("bearer authentication fails closed", () => {
  const request = new Request("http://localhost", {
    headers: { authorization: `Bearer ${"s".repeat(32)}` },
  });
  assert.equal(authorized(request, undefined), false);
  assert.equal(authorized(request, "short"), false);
  assert.equal(authorized(request, "t".repeat(32)), false);
  assert.equal(authorized(request, "s".repeat(32)), true);
});
test("disabled or misconfigured worker never accesses database or provider", async () => {
  const original = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw Error("Unexpected network call");
    }) as typeof fetch;
    process.env.CRON_SECRET = "s".repeat(32);
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    delete process.env.INTAKE_NOTIFICATIONS_ENABLED;
    assert.deepEqual(await (await handleNotificationWorker(request)).json(), {
      enabled: false,
      processed: 0,
    });
    process.env.INTAKE_NOTIFICATIONS_ENABLED = "true";
    delete process.env.RESEND_API_KEY;
    assert.equal((await handleNotificationWorker(request)).status, 503);
    assert.equal(
      (await handleNotificationWorker(new Request("http://localhost"))).status,
      401,
    );
  } finally {
    process.env = original;
    globalThis.fetch = oldFetch;
  }
});
test("actual intake endpoint saves via one RPC and succeeds independently of email configuration", async () => {
  const original = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.SUPABASE_INTAKE_TABLE = "intake_submissions";
    delete process.env.RESEND_API_KEY;
    let calls = 0;
    globalThis.fetch = (async (url, init) => {
      calls++;
      assert.equal(
        url,
        "https://test.supabase.co/rest/v1/rpc/submit_intake_with_notification",
      );
      const body = JSON.parse(init!.body as string);
      assert.equal(body.p_table, "intake_submissions");
      assert.equal(body.p_submission.email, "person@example.com");
      assert.deepEqual(body.p_submission.tools_or_systems, ["Excel"]);
      return Response.json("1");
    }) as typeof fetch;
    const form = new FormData();
    form.set("name", "Test");
    form.set("email", "person@example.com");
    form.append("toolsOrSystems", "Excel");
    const result = await POST(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: form,
      }),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    assert.equal(calls, 1);
    globalThis.fetch = (async () =>
      new Response("database unavailable", { status: 503 })) as typeof fetch;
    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/intake", {
            method: "POST",
            body: form,
          }),
        )
      ).status,
      500,
    );
  } finally {
    process.env = original;
    globalThis.fetch = oldFetch;
  }
});

test("enabled HTTP worker claims and persists provider acceptance through authenticated RPCs", async () => {
  const original = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.CRON_SECRET = "s".repeat(32);
    process.env.INTAKE_NOTIFICATIONS_ENABLED = "true";
    process.env.RESEND_API_KEY = config.apiKey;
    process.env.INTAKE_NOTIFICATION_FROM = config.from;
    const calls: string[] = [];
    globalThis.fetch = (async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith("/claim_intake_notification")) {
        assert.equal(
          (init!.headers as Record<string, string>).apikey,
          "sb_secret_test",
        );
        return Response.json([job]);
      }
      if (String(url) === "https://api.resend.com/emails")
        return Response.json({ id: "provider-http" });
      assert.ok(String(url).endsWith("/finish_intake_notification"));
      assert.deepEqual(JSON.parse(init!.body as string), {
        p_id: job.id,
        p_claim_token: job.claim_token,
        p_status: "accepted",
        p_code: "provider_accepted",
        p_provider_id: "provider-http",
      });
      return Response.json(true);
    }) as typeof fetch;
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const result = await handleNotificationWorker(request);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { processed: 1, status: "accepted" });
    assert.equal(calls.length, 3);
  } finally {
    process.env = original;
    globalThis.fetch = oldFetch;
  }
});
