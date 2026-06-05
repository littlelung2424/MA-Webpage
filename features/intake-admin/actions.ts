"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import {
  getSupabaseConfig,
  SUPABASE_INTAKE_TABLE,
  supabaseHeaders,
  supabaseReadinessError,
} from "../../lib/intakeSupabase";
import { deleteErrorMessage } from "./data";
import { blobPathnamesForDelete } from "./files";
import {
  STATUS_OPTIONS,
  type IntakeStatus,
  type IntakeSubmission,
} from "./types";

export async function updateSubmission(formData: FormData) {
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

  const response = await fetch(
    `${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        status: requestedStatus,
        internal_notes: internalNotes || null,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase intake admin update failed with status ${response.status}: ${await response.text()}`,
    );
  }

  revalidatePath("/admin/intake");
}

function blobTokenOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? { token } : {};
}

export async function deleteSubmission(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const confirmation = String(formData.get("confirm_delete") ?? "").trim();

  if (!id) {
    throw new Error("Missing submission id.");
  }

  if (confirmation !== "delete") {
    throw new Error(
      "Check the confirmation box before permanently deleting this submission.",
    );
  }

  const { supabaseUrl } = getSupabaseConfig();
  const readinessError = supabaseReadinessError();

  if (readinessError) {
    throw new Error(readinessError);
  }

  const rowParams = new URLSearchParams({
    select: "id,current_process_files,desired_output_files",
    limit: "1",
    id: `eq.${id}`,
  });
  const rowResponse = await fetch(
    `${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?${rowParams}`,
    {
      headers: supabaseHeaders(),
      cache: "no-store",
    },
  );

  if (!rowResponse.ok) {
    throw new Error(
      deleteErrorMessage(
        "delete lookup",
        rowResponse.status,
        await rowResponse.text(),
      ),
    );
  }

  const [submission] = (await rowResponse.json()) as IntakeSubmission[];

  if (!submission) {
    throw new Error("This submission was already deleted or could not be found.");
  }

  const blobPathnames = blobPathnamesForDelete(submission);

  if (blobPathnames.length > 0) {
    try {
      await del(blobPathnames, blobTokenOptions());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Vercel Blob delete error.";
      throw new Error(
        `Could not delete the uploaded files from Vercel Blob, so the Supabase row was kept for retry: ${message}`,
      );
    }
  }

  const deleteResponse = await fetch(
    `${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders("return=minimal"),
    },
  );

  if (!deleteResponse.ok) {
    throw new Error(
      deleteErrorMessage(
        "delete",
        deleteResponse.status,
        await deleteResponse.text(),
      ),
    );
  }

  revalidatePath("/admin/intake");
}
