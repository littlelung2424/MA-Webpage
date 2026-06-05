import {
  getSupabaseConfig,
  SUPABASE_INTAKE_TABLE,
  supabaseHeaders,
  supabaseReadinessError,
} from "../../lib/intakeSupabase";
import { displayFiles, parseFiles } from "./files";
import {
  STATUS_OPTIONS,
  type IntakeStatus,
  type IntakeSubmission,
  type SubmissionWithFiles,
} from "./types";

export function supabaseResponseDetail(responseText: string) {
  const compactResponseText = responseText.replace(/\s+/g, " ").trim();
  return compactResponseText
    ? ` Supabase response: ${compactResponseText.slice(0, 240)}`
    : "";
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

export async function fetchSubmissions() {
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
    status: "neq.Done",
  });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?${searchParams}`,
      {
        headers: supabaseHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.error("Supabase intake admin fetch failed", {
        status: response.status,
        responseText,
      });

      return {
        submissions: [],
        error: adminFetchErrorMessage(response.status, responseText),
      };
    }

    return {
      submissions: (await response.json()) as IntakeSubmission[],
      error: null,
    };
  } catch (error) {
    console.error("Supabase intake admin fetch threw", error);

    return {
      submissions: [],
      error: "Could not connect to Supabase to load intake submissions.",
    };
  }
}

export function submissionsWithDisplayFiles(
  submissions: IntakeSubmission[],
): SubmissionWithFiles[] {
  return submissions.map((submission) => ({
    submission,
    currentFiles: displayFiles(parseFiles(submission.current_process_files)),
    desiredFiles: displayFiles(parseFiles(submission.desired_output_files)),
  }));
}

export function deleteErrorMessage(
  action: string,
  status: number,
  responseText: string,
) {
  return `Supabase intake admin ${action} failed with status ${status}:${supabaseResponseDetail(responseText)}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function normalizeStatus(status?: string | null): IntakeStatus {
  return STATUS_OPTIONS.find((option) => option === status) ?? "New";
}

export function stringListValue(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && Boolean(entry.trim()),
  );
}

function isKnownDisplayField(key: string) {
  return new Set([
    "id",
    "created_at",
    "name",
    "email",
    "tools_or_systems",
    "process_involvement",
    "task",
    "success",
    "anything_else",
    "current_process_files",
    "desired_output_files",
    "status",
    "internal_notes",
  ]).has(key);
}

export function extraDetailsFor(submission: IntakeSubmission) {
  return Object.entries(submission)
    .filter(([, value]) => value !== null && value !== undefined)
    .filter(([key]) => !isKnownDisplayField(key));
}
