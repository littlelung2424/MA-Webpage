import { issueSignedToken, presignUrl } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { getSupabaseConfig, SUPABASE_INTAKE_TABLE, supabaseHeaders, supabaseReadinessError } from "../../../lib/intakeSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["New", "Reviewing", "Done"] as const;
const SIGNED_URL_TTL_MS = 1000 * 60 * 15;

type IntakeStatus = (typeof STATUS_OPTIONS)[number];

type IntakeFile = {
  name?: unknown;
  url?: unknown;
  pathname?: unknown;
  downloadUrl?: unknown;
};

type IntakeSubmission = {
  id: number | string;
  created_at?: string | null;
  name?: string | null;
  email?: string | null;
  task?: string | null;
  success?: string | null;
  anything_else?: string | null;
  current_process_files?: unknown;
  desired_output_files?: unknown;
  status?: string | null;
  internal_notes?: string | null;
  [key: string]: unknown;
};

type DisplayFile = {
  name: string;
  signedUrl: string | null;
  originalUrl: string | null;
};

function supabaseResponseDetail(responseText: string) {
  const compactResponseText = responseText.replace(/\s+/g, " ").trim();
  return compactResponseText ? ` Supabase response: ${compactResponseText.slice(0, 240)}` : "";
}

function adminFetchErrorMessage(status: number, responseText: string) {
  const detail = supabaseResponseDetail(responseText);

  if (status === 401 || status === 403) {
    return `Could not load intake submissions from Supabase. Status ${status}.${detail} Row Level Security is expected on this table, but it should not block a real Supabase service_role/sb_secret key. Confirm the deployment is running this latest code, confirm SUPABASE_SERVICE_ROLE_KEY is the legacy service_role key or SUPABASE_SECRET_KEY is an sb_secret key for this Supabase project, not the anon/publishable key, confirm the ${SUPABASE_INTAKE_TABLE} table exists, and apply supabase/migrations/20260604010000_grant_intake_service_role_access.sql so service_role has table grants.`;
  }

  if (status === 404) {
    return `Could not load intake submissions from Supabase. Status 404.${detail} Confirm the ${SUPABASE_INTAKE_TABLE} table exists in the public schema, or update SUPABASE_INTAKE_TABLE to the deployed table name.`;
  }

  return `Could not load intake submissions from Supabase. Status ${status}.${detail}`;
}

async function fetchSubmissions() {
  const { supabaseUrl } = getSupabaseConfig();
  const readinessError = supabaseReadinessError();

  if (readinessError) {
    return {
      submissions: [],
      error: readinessError,
    };
  }

  const searchParams = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: "100",
  });

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?${searchParams}`, {
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error("Supabase intake admin fetch failed", { status: response.status, responseText });

      return {
        submissions: [],
        error: adminFetchErrorMessage(response.status, responseText),
      };
    }

    return { submissions: (await response.json()) as IntakeSubmission[], error: null };
  } catch (error) {
    console.error("Supabase intake admin fetch threw", error);

    return {
      submissions: [],
      error: "Could not connect to Supabase to load intake submissions.",
    };
  }
}

function parseFiles(value: unknown): IntakeFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((file): file is IntakeFile => Boolean(file) && typeof file === "object");
}

function pathnameFromBlobUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

async function signedFileUrl(file: IntakeFile) {
  const url = typeof file.url === "string" ? file.url : typeof file.downloadUrl === "string" ? file.downloadUrl : "";
  const pathname = typeof file.pathname === "string" ? file.pathname : pathnameFromBlobUrl(url);

  if (!pathname) return null;

  try {
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
      ...(process.env.BLOB_READ_WRITE_TOKEN?.trim() ? { token: process.env.BLOB_READ_WRITE_TOKEN.trim() } : {}),
    });
    const { presignedUrl } = await presignUrl(signedToken, { access: "private", operation: "get", pathname, validUntil });
    return presignedUrl;
  } catch (error) {
    console.error("Failed to sign private Blob URL", { pathname, error });
    return null;
  }
}

async function displayFiles(files: IntakeFile[]): Promise<DisplayFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const originalUrl = typeof file.url === "string" ? file.url : typeof file.downloadUrl === "string" ? file.downloadUrl : null;
      const name = typeof file.name === "string" && file.name.trim() ? file.name : pathnameFromBlobUrl(originalUrl ?? "") || "Uploaded file";

      return {
        name,
        originalUrl,
        signedUrl: await signedFileUrl(file),
      };
    }),
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeStatus(status?: string | null): IntakeStatus {
  return STATUS_OPTIONS.find((option) => option === status) ?? "New";
}

function isKnownDisplayField(key: string) {
  return new Set([
    "id",
    "created_at",
    "name",
    "email",
    "task",
    "success",
    "anything_else",
    "current_process_files",
    "desired_output_files",
    "status",
    "internal_notes",
  ]).has(key);
}

function extraDetailsFor(submission: IntakeSubmission) {
  return Object.entries(submission).filter(([, value]) => value !== null && value !== undefined).filter(([key]) => !isKnownDisplayField(key));
}

async function updateSubmission(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const requestedStatus = String(formData.get("status") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();

  if (!id) {
    throw new Error("Missing submission id.");
  }

  if (!STATUS_OPTIONS.includes(requestedStatus as IntakeStatus)) {
    throw new Error("Invalid intake status.");
  }

  const { supabaseUrl } = getSupabaseConfig();
  const readinessError = supabaseReadinessError();

  if (readinessError) {
    throw new Error(readinessError);
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({
      status: requestedStatus,
      internal_notes: internalNotes || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase intake admin update failed with status ${response.status}: ${await response.text()}`);
  }

  revalidatePath("/admin/intake");
}

function AdminErrorCard({ message }: { message: string }) {
  return (
    <div className="admin-error-card" role="status">
      <strong>Admin dashboard could not load submissions.</strong>
      <p>{message}</p>
      <p>Check the Vercel environment variables for this deployment, confirm the Supabase table exists, then redeploy if you changed settings.</p>
      <p>Open <a href="/api/admin/intake/debug">/api/admin/intake/debug</a> while signed in with admin Basic Auth to see safe runtime diagnostics for the deployed Supabase URL, key type, and REST probe status.</p>
      <p>Table configured for this deployment: <code>{SUPABASE_INTAKE_TABLE}</code>.</p>
    </div>
  );
}

function FileList({ files }: { files: DisplayFile[] }) {
  if (files.length === 0) {
    return <p className="admin-empty">No files uploaded.</p>;
  }

  return (
    <ul className="admin-file-list">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`}>
          {file.signedUrl ? (
            <a href={file.signedUrl} target="_blank" rel="noreferrer">
              {file.name}
            </a>
          ) : (
            <span>{file.name}</span>
          )}
          <small>{file.signedUrl ? "Private signed link, expires in 15 minutes" : "Could not create signed link"}</small>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminIntakePage() {
  const { submissions, error } = await fetchSubmissions();

  const submissionsWithFiles = error
    ? []
    : await Promise.all(
        submissions.map(async (submission) => ({
          submission,
          currentFiles: await displayFiles(parseFiles(submission.current_process_files)),
          desiredFiles: await displayFiles(parseFiles(submission.desired_output_files)),
        })),
      );

  return (
    <main className="intake-page admin-page">
      <section className="intake-card admin-card">
        <div className="intro-block admin-intro">
          <p className="eyebrow">Private admin</p>
          <h1>Intake submissions</h1>
          <p className="intro-copy">
            Review incoming requests, securely open private Blob uploads with temporary signed links, and keep status and internal notes up to date.
          </p>
        </div>

        {error ? (
          <AdminErrorCard message={error} />
        ) : (
          <div className="admin-toolbar">
            <strong>{submissions.length}</strong> submission{submissions.length === 1 ? "" : "s"} shown, newest first.
          </div>
        )}

        <div className="admin-submission-list">
          {!error && submissionsWithFiles.length === 0 && <p className="admin-empty-card">No intake submissions yet.</p>}

          {submissionsWithFiles.map(({ submission, currentFiles, desiredFiles }) => {
            const extraDetails = extraDetailsFor(submission);

            return (
              <article className="admin-submission-card" key={submission.id}>
                <header className="admin-submission-header">
                  <div>
                    <h2>{submission.name || "Unnamed submission"}</h2>
                    {submission.email && <a href={`mailto:${submission.email}`}>{submission.email}</a>}
                  </div>
                  <div className="admin-meta">
                    <span className={`admin-status-pill status-${normalizeStatus(submission.status).toLowerCase()}`}>{normalizeStatus(submission.status)}</span>
                    <time dateTime={submission.created_at ?? undefined}>{formatDate(submission.created_at)}</time>
                  </div>
                </header>

                <div className="admin-content-grid">
                  <section>
                    <h3>Task / problem description</h3>
                    <p>{submission.task || "No task description provided."}</p>
                  </section>
                  <section>
                    <h3>Desired outcome</h3>
                    <p>{submission.success || "No desired outcome provided."}</p>
                  </section>
                  <section>
                    <h3>Anything else</h3>
                    <p>{submission.anything_else || "No additional notes provided."}</p>
                  </section>
                  <section>
                    <h3>Current process files</h3>
                    <FileList files={currentFiles} />
                  </section>
                  <section>
                    <h3>Desired output files</h3>
                    <FileList files={desiredFiles} />
                  </section>
                </div>

                {extraDetails.length > 0 && (
                  <details className="admin-extra-details">
                    <summary>Additional submission fields</summary>
                    <dl>
                      {extraDetails.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}

                <form className="admin-update-form" action={updateSubmission}>
                  <input type="hidden" name="id" value={submission.id} />
                  <label>
                    <span>Status</span>
                    <select name="status" defaultValue={normalizeStatus(submission.status)}>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Internal notes</span>
                    <textarea name="internal_notes" rows={4} defaultValue={submission.internal_notes ?? ""} placeholder="Private admin notes" />
                  </label>
                  <button className="submit-button admin-save-button" type="submit">
                    Save updates
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
