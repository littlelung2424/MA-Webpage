import { put } from "@vercel/blob";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"]);
const ACCEPTED_FILE_TYPES_LABEL = "PNG, JPG, PDF, Word, Excel, or CSV";
const GENERIC_INTAKE_ERROR =
  "Something went wrong while sending your request. Please try again, or email us directly if it keeps happening.";
const SUPABASE_INTAKE_TABLE = process.env.SUPABASE_INTAKE_TABLE?.trim() || "intake_submissions";

type UploadedFile = {
  name: string;
  url?: string;
};

type IntakeSubmission = {
  name: string;
  email: string;
  task: string;
  success: string;
  anythingElse: string;
  uploadedFiles: UploadedFile[];
  uploadedSuccessFiles: UploadedFile[];
};

function getIntakeDeliveryConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  return {
    blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "",
    supabaseUrl,
    supabaseServiceRoleKey,
    hasSupabaseDelivery: Boolean(supabaseUrl && supabaseServiceRoleKey),
  };
}

function missingSupabaseConfig({
  supabaseUrl,
  supabaseServiceRoleKey,
}: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}) {
  const missing: string[] = [];

  if (!supabaseUrl) {
    missing.push("SUPABASE_URL");
  }

  if (!supabaseServiceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extensionFor(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

async function saveIntakeSubmissionToSupabase({
  supabaseUrl,
  supabaseServiceRoleKey,
  submission,
}: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  submission: IntakeSubmission;
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      name: submission.name,
      email: submission.email,
      task: submission.task || null,
      success: submission.success || null,
      anything_else: submission.anythingElse || null,
      current_process_files: submission.uploadedFiles,
      desired_output_files: submission.uploadedSuccessFiles,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase intake insert failed with status ${response.status}: ${await response.text()}`);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = clean(formData.get("name"));
    const email = clean(formData.get("email"));
    const task = clean(formData.get("task"));
    const success = clean(formData.get("success"));
    const anythingElse = clean(formData.get("anythingElse"));
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const successFiles = formData
      .getAll("successFiles")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!name || !email) {
      return errorResponse("Please enter your name and email address so we know who to contact.");
    }

    if (!isValidEmail(email)) {
      return errorResponse("Please enter a valid email address, like name@example.com.");
    }

    for (const fileSet of [files, successFiles]) {
      if (fileSet.length > MAX_FILE_COUNT) {
        return errorResponse(`Please keep each file section to ${MAX_FILE_COUNT} files or fewer.`);
      }
    }

    for (const file of [...files, ...successFiles]) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return errorResponse(`“${file.name}” is over the 10MB limit. Please choose a smaller file and try again.`);
      }

      if (!ACCEPTED_EXTENSIONS.has(extensionFor(file.name))) {
        return errorResponse(`“${file.name}” is not a supported file type. Please upload a ${ACCEPTED_FILE_TYPES_LABEL} file.`);
      }
    }

    // Configure Supabase delivery in Vercel Project Settings > Environment Variables.
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for every submission.
    // BLOB_READ_WRITE_TOKEN is required when the visitor attaches files or screenshots.
    const { blobToken, supabaseUrl, supabaseServiceRoleKey, hasSupabaseDelivery } = getIntakeDeliveryConfig();

    if (!hasSupabaseDelivery) {
      console.error("Supabase intake delivery environment variables are not configured", {
        missingSupabaseConfig: missingSupabaseConfig({ supabaseUrl, supabaseServiceRoleKey }),
      });
      return errorResponse(GENERIC_INTAKE_ERROR, 500);
    }

    const allFiles = [...files, ...successFiles];

    if (allFiles.length > 0 && !blobToken) {
      console.error("Vercel Blob is not configured for intake file uploads", {
        missingBlobConfig: ["BLOB_READ_WRITE_TOKEN"],
      });
      return errorResponse(
        "File uploads need storage to be configured before this form can send files or screenshots. Please email the files directly for now.",
        500,
      );
    }

    async function uploadFiles(filesToUpload: File[], folder: string) {
      const uploaded: UploadedFile[] = [];

      for (const file of filesToUpload) {
        const blob = await put(`intake/${folder}/${Date.now()}-${safeFileName(file.name)}`, file, {
          access: "public",
          addRandomSuffix: true,
          token: blobToken,
        });

        uploaded.push({ name: file.name, url: blob.url });
      }

      return uploaded;
    }

    const uploadedFiles = await uploadFiles(files, "current-process");
    const uploadedSuccessFiles = await uploadFiles(successFiles, "desired-output");
    const submission = { name, email, task, success, anythingElse, uploadedFiles, uploadedSuccessFiles };

    await saveIntakeSubmissionToSupabase({ supabaseUrl, supabaseServiceRoleKey, submission });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Intake submission failed", error);
    return errorResponse(GENERIC_INTAKE_ERROR, 500);
  }
}
