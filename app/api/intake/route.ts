import { put } from "@vercel/blob";
import { GENERIC_INTAKE_ERROR } from "../../../features/intake/constants";
import { blobFileName, safeFileName } from "../../../features/intake/files";
import {
  getSupabaseConfig,
  saveIntakeSubmissionToSupabase,
  supabaseReadinessError,
} from "../../../features/intake/supabase";
import type { UploadedFile } from "../../../features/intake/types";
import { isValidEmail, validateServerFiles } from "../../../features/intake/validation";

export const runtime = "nodejs";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = clean(formData.get("name"));
    const email = clean(formData.get("email"));
    const toolsOrSystems = formData
      .getAll("toolsOrSystems")
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const processInvolvement = clean(formData.get("processInvolvement"));
    const task = clean(formData.get("task"));
    const success = clean(formData.get("success"));
    const anythingElse = clean(formData.get("anythingElse"));
    const files = formData
      .getAll("files")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );
    const successFiles = formData
      .getAll("successFiles")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );

    if (!name || !email) {
      return errorResponse(
        "Please enter your name and email address so we know who to contact.",
      );
    }

    if (!isValidEmail(email)) {
      return errorResponse(
        "Please enter a valid email address, like name@example.com.",
      );
    }

    const fileValidationError = validateServerFiles([files, successFiles]);
    if (fileValidationError) {
      return errorResponse(fileValidationError);
    }

    // Configure Supabase delivery in Vercel Project Settings > Environment Variables.
    // SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY are required for every submission.
    // Vercel Blob uploads are intentionally private so attachments require authenticated access.
    // Vercel Blob uses project-level authentication on Vercel; BLOB_READ_WRITE_TOKEN is only
    // needed for local development or stores not connected to this project.
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "";
    const { supabaseUrl } = getSupabaseConfig();
    const readinessError = supabaseReadinessError();

    if (readinessError) {
      console.error("Supabase intake delivery is not ready", {
        readinessError,
      });
      return errorResponse(GENERIC_INTAKE_ERROR, 500);
    }

    async function uploadFiles(filesToUpload: File[], folder: string) {
      const uploaded: UploadedFile[] = [];

      for (const file of filesToUpload) {
        const blob = await put(
          `intake/${folder}/${Date.now()}-${safeFileName(file.name)}`,
          file,
          {
            access: "private",
            addRandomSuffix: true,
            ...(blobToken ? { token: blobToken } : {}),
          },
        );
        const contentType = file.type || "application/octet-stream";

        uploaded.push({
          name: file.name,
          filename: file.name,
          pathname: blob.pathname,
          size: file.size,
          content_type: contentType,
          blob_file_path: blob.pathname,
          blob_file_name: blobFileName(blob.pathname),
          blob_file_size: file.size,
          blob_file_content_type: contentType,
        });
      }

      return uploaded;
    }

    const uploadedFiles = await uploadFiles(files, "current-process");
    const uploadedSuccessFiles = await uploadFiles(
      successFiles,
      "desired-output",
    );
    const submission = {
      name,
      email,
      toolsOrSystems,
      processInvolvement,
      task,
      success,
      anythingElse,
      uploadedFiles,
      uploadedSuccessFiles,
    };

    await saveIntakeSubmissionToSupabase({ supabaseUrl, submission });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Intake submission failed", error);
    return errorResponse(GENERIC_INTAKE_ERROR, 500);
  }
}
