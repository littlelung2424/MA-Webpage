import type { IntakeSubmission } from "./types";
import {
  getSupabaseConfig,
  SUPABASE_INTAKE_TABLE,
  supabaseHeaders,
  supabaseReadinessError,
} from "../../lib/intakeSupabase";

export { getSupabaseConfig, supabaseReadinessError };

export async function saveIntakeSubmissionToSupabase({
  supabaseUrl,
  submission,
}: {
  supabaseUrl: string;
  submission: IntakeSubmission;
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}`,
    {
      method: "POST",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        name: submission.name,
        email: submission.email,
        tools_or_systems: submission.toolsOrSystems,
        process_involvement: submission.processInvolvement || null,
        task: submission.task || null,
        success: submission.success || null,
        anything_else: submission.anythingElse || null,
        current_process_files: submission.uploadedFiles,
        desired_output_files: submission.uploadedSuccessFiles,
        status: "New",
        internal_notes: null,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase intake insert failed with status ${response.status}: ${await response.text()}`,
    );
  }
}
