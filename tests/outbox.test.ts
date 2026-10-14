import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import { emailBody, type Job } from "../features/intake-notifications/worker";

const submission = {
  name: "Test",
  email: "person@example.com",
  tools_or_systems: ["Excel"],
  process_involvement: "Daily",
  task: "Task",
  success: "Success",
  anything_else: "Notes",
  current_process_files: [
    {
      name: "input.csv",
      pathname: "private/path",
      url: "https://private.blob.vercel-storage.com/file",
    },
  ],
  desired_output_files: [
    { name: "output.png", blob_file_path: "secret/output.png" },
  ],
};

test(
  "outbox SQL on isolated Postgres (no remote services)",
  { timeout: 120_000 },
  async (t) => {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((r) => server.close(() => r()));
    const root = resolve("work");
    await mkdir(root, { recursive: true });
    const databaseDir = await mkdtemp(join(root, "notification-db-"));
    const db = new EmbeddedPostgres({
      databaseDir,
      port,
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });
    const platform =
      process.platform === "win32" ? "windows" : process.platform;
    const { pg_ctl: pgCtl } = (await import(
      `@embedded-postgres/${platform}-${process.arch}`
    )) as { pg_ctl: string };
    const control = (args: string[]) =>
      promisify(execFile)(pgCtl, args, { windowsHide: true, timeout: 30_000 });
    let started = false;
    let c: ReturnType<typeof db.getPgClient> | undefined;
    let other: ReturnType<typeof db.getPgClient> | undefined;
    try {
      await db.initialise();
      // pg_ctl performs a graceful stop on Windows; embedded-postgres.stop uses taskkill.
      await control([
        "-D",
        databaseDir,
        "-l",
        join(databaseDir, "server.log"),
        "-o",
        `-p ${port}`,
        "-w",
        "start",
      ]);
      started = true;
      c = db.getPgClient();
      other = db.getPgClient();
      await c.connect();
      await other.connect();
      await c.query(
        "create role anon; create role authenticated; create role service_role bypassrls",
      );
      for (const file of (await readdir("supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        await c.query(
          await readFile(join("supabase/migrations", file), "utf8"),
        );
      }
      const client = c;
      const second = other;
      const submit = async () =>
        (
          await client.query(
            "select public.submit_intake_with_notification($1) as id",
            [submission],
          )
        ).rows[0].id;
      const claim = async (conn = client) =>
        (await conn.query("select * from public.claim_intake_notification()"))
          .rows;
      const finish = async (
        j: Job,
        status: string,
        provider: string | null = null,
      ) =>
        (
          await client.query(
            "select public.finish_intake_notification($1,$2,$3,$4,$5) as ok",
            [j.id, j.claim_token, status, "test", provider],
          )
        ).rows[0].ok;
      const reset = async () => {
        await client.query(
          "truncate public.intake_notification_outbox,public.intake_submissions restart identity",
        );
      };

      await t.test(
        "RPC atomically saves submission and sanitized outbox snapshot",
        async () => {
          await client.query("set role service_role");
          const id = await submit();
          const [j] = (
            await client.query(
              "select * from public.intake_notification_outbox",
            )
          ).rows;
          assert.equal(j.submission_id, id);
          assert.equal(
            j.idempotency_key,
            `mission-atlas-intake/intake_submissions/${id}`,
          );
          assert.equal(j.payload.id, id);
          assert.ok(j.payload.created_at);
          assert.deepEqual(j.payload.current_process_filenames, ["input.csv"]);
          assert.deepEqual(j.payload.desired_output_filenames, ["output.png"]);
          assert.ok(!JSON.stringify(j.payload).includes("private/path"));
          assert.ok(
            !JSON.stringify(emailBody(j, "intake@missionatlasxd.com")).includes(
              "secret/output",
            ),
          );
          assert.ok(!JSON.stringify(j.payload).includes("blob.vercel-storage"));
          assert.equal(j.status, "pending");
          const [claimed] = await claim();
          assert.equal(
            await finish(claimed, "accepted", "service-role-provider"),
            true,
          );
          await client.query("reset role");
        },
      );
      await t.test(
        "outbox insert failure rolls back the intake insert",
        async () => {
          await reset();
          await client.query(
            "create function public.test_reject_outbox() returns trigger language plpgsql as $$ begin raise exception 'forced outbox failure'; end $$; create trigger test_reject before insert on public.intake_notification_outbox for each row execute function public.test_reject_outbox()",
          );
          await assert.rejects(submit(), /forced outbox failure/);
          assert.equal(
            (
              await client.query(
                "select count(*)::int n from public.intake_submissions",
              )
            ).rows[0].n,
            0,
          );
          await client.query(
            "drop trigger test_reject on public.intake_notification_outbox; drop function public.test_reject_outbox()",
          );
        },
      );
      await t.test(
        "submission validation failure creates no outbox",
        async () => {
          await reset();
          await assert.rejects(
            client.query("select public.submit_intake_with_notification($1)", [
              { ...submission, name: null },
            ]),
          );
          assert.equal(
            (
              await client.query(
                "select count(*)::int n from public.intake_notification_outbox",
              )
            ).rows[0].n,
            0,
          );
        },
      );
      await t.test(
        "duplicate job uniqueness and custom table configuration",
        async () => {
          await reset();
          await submit();
          await assert.rejects(
            client.query(
              "insert into public.intake_notification_outbox(submission_table,submission_id,idempotency_key,payload) select submission_table,submission_id,idempotency_key,payload from public.intake_notification_outbox",
            ),
            /duplicate key/,
          );
          await client.query(
            "create table public.custom_intake (like public.intake_submissions including all)",
          );
          const result = await client.query(
            "select public.submit_intake_with_notification($1,$2) id",
            [submission, "custom_intake"],
          );
          assert.equal(
            (
              await client.query(
                "select count(*)::int n from public.intake_notification_outbox where submission_table='custom_intake'",
              )
            ).rows[0].n,
            1,
          );
          assert.ok(result.rows[0].id);
          await client.query("drop table public.custom_intake");
        },
      );
      await t.test(
        "competing connections skip locked claims and cannot claim same job",
        async () => {
          await reset();
          await submit();
          await submit();
          await client.query("begin");
          const [first] = await claim();
          await second.query("set statement_timeout='2s'");
          const [next] = await claim(second);
          assert.notEqual(first.id, next.id);
          await client.query("commit");
          assert.deepEqual(await claim(), []);
          assert.equal(await finish(first, "accepted", "provider1"), true);
          assert.equal(await finish(first, "retry"), false);
          assert.deepEqual(await claim(), []);
        },
      );
      await t.test(
        "simultaneous workers claim a singleton only once",
        async () => {
          await reset();
          await submit();
          const results = await Promise.all([claim(), claim(second)]);
          assert.equal(results.flat().length, 1);
        },
      );
      await t.test(
        "retry schedule, stable key, new claim token, and fencing stale completion",
        async () => {
          await reset();
          await submit();
          const [first] = await claim();
          assert.equal(await finish(first, "retry"), true);
          assert.deepEqual(await claim(), []);
          const row = (
            await client.query(
              "select *, extract(epoch from (next_attempt_at-updated_at))::int delay from public.intake_notification_outbox",
            )
          ).rows[0];
          assert.equal(row.delay, 60);
          await client.query(
            "update public.intake_notification_outbox set next_attempt_at=now()-interval '1 second'",
          );
          const [next] = await claim();
          assert.equal(next.idempotency_key, first.idempotency_key);
          assert.notEqual(next.claim_token, first.claim_token);
          assert.equal(next.attempts, 2);
          assert.equal(await finish(first, "accepted", "stale"), false);
          assert.equal(await finish(next, "accepted", "provider2"), true);
          assert.equal(
            (
              await client.query(
                "select status,provider_id from public.intake_notification_outbox",
              )
            ).rows[0].provider_id,
            "provider2",
          );
        },
      );
      await t.test(
        "five explicit rejections exhaust retries and operator retry retains attempt count",
        async () => {
          await reset();
          await submit();
          let id = "";
          for (let i = 1; i <= 5; i++) {
            const [j] = await claim();
            id = j.id;
            assert.equal(j.attempts, i);
            assert.equal(await finish(j, "retry"), true);
            await client.query(
              "update public.intake_notification_outbox set next_attempt_at=now()-interval '1 second'",
            );
          }
          assert.deepEqual(await claim(), []);
          assert.equal(
            (
              await client.query(
                "select status from public.intake_notification_outbox",
              )
            ).rows[0].status,
            "failed",
          );
          await client.query(
            "select public.resolve_intake_notification($1,'retry','Confirmed provider rejected all attempts')",
            [id],
          );
          assert.equal((await claim())[0].attempts, 6);
        },
      );
      await t.test(
        "expired processing lease requires reconciliation, never automatic retry",
        async () => {
          await reset();
          await submit();
          const [j] = await claim();
          await client.query(
            "update public.intake_notification_outbox set claimed_at=now()-interval '6 minutes'",
          );
          assert.deepEqual(await claim(), []);
          const row = (
            await client.query(
              "select * from public.intake_notification_outbox",
            )
          ).rows[0];
          assert.equal(row.status, "reconciliation");
          assert.equal(row.last_code, "worker_lease_expired");
          assert.equal(await finish(j, "accepted", "late"), false);
          await assert.rejects(
            client.query(
              "select public.resolve_intake_notification($1,'retry','')",
              [j.id],
            ),
            /evidence/,
          );
          await client.query(
            "select public.resolve_intake_notification($1,'accepted','Resend confirms accepted email','known-provider-id')",
            [j.id],
          );
          assert.deepEqual(await claim(), []);
          assert.equal(
            (
              await client.query(
                "select public.resolve_intake_notification($1,'retry','Do not retry accepted message') ok",
                [j.id],
              )
            ).rows[0].ok,
            false,
          );
        },
      );
      await t.test(
        "provider ambiguity remains parked across repeated worker runs",
        async () => {
          await reset();
          await submit();
          const [j] = await claim();
          await finish(j, "reconciliation");
          assert.deepEqual(await claim(), []);
          assert.deepEqual(await claim(second), []);
          await client.query(
            "select public.resolve_intake_notification($1,'retry','Confirmed not accepted; original worker stopped')",
            [j.id],
          );
          assert.equal((await claim())[0].idempotency_key, j.idempotency_key);
        },
      );
      await t.test("admin deletion purges queued snapshot", async () => {
        await reset();
        const id = await submit();
        await client.query(
          "delete from public.intake_submissions where id=$1",
          [id],
        );
        assert.deepEqual(await claim(), []);
        assert.equal(
          (
            await client.query(
              "select count(*)::int n from public.intake_notification_outbox",
            )
          ).rows[0].n,
          0,
        );
      });
      await t.test(
        "RLS and function grants deny anonymous and authenticated access",
        async () => {
          for (const role of ["anon", "authenticated"]) {
            await client.query(`set role ${role}`);
            await assert.rejects(
              client.query("select * from public.intake_notification_outbox"),
              /permission denied/,
            );
            await assert.rejects(claim(), /permission denied/);
            await assert.rejects(submit(), /permission denied/);
            await assert.rejects(
              client.query(
                "select public.resolve_intake_notification(gen_random_uuid(),'retry','unauthorized access')",
              ),
              /permission denied/,
            );
            await client.query("reset role");
          }
          assert.equal(
            (
              await client.query(
                "select relrowsecurity from pg_class where oid='public.intake_notification_outbox'::regclass",
              )
            ).rows[0].relrowsecurity,
            true,
          );
          assert.equal(
            (
              await client.query(
                "select count(*)::int n from pg_proc where proname in ('submit_intake_with_notification','claim_intake_notification','finish_intake_notification','resolve_intake_notification','delete_intake_notification') and prosecdef",
              )
            ).rows[0].n,
            0,
          );
        },
      );
    } finally {
      await c?.end();
      await other?.end();
      if (started)
        await control(["-D", databaseDir, "-m", "fast", "-w", "stop"]);
    }
  },
);
