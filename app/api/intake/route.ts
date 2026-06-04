import { put } from "@vercel/blob";
import { Resend } from "resend";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const MAX_EMAIL_ATTACHMENT_BYTES = 35 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"]);
const ACCEPTED_FILE_TYPES_LABEL = "PNG, JPG, PDF, Word, Excel, or CSV";
const GENERIC_INTAKE_ERROR =
  "Something went wrong while sending your request. Please try again, or email us directly if it keeps happening.";
const INTAKE_NOTIFY_EMAIL_ENV_NAMES = [
  "INTAKE_NOTIFY_EMAIL",
  "INTAKE_NOTIFICATION_EMAIL",
  "NOTIFICATION_EMAIL",
] as const;
const SUPABASE_INTAKE_TABLE = process.env.SUPABASE_INTAKE_TABLE?.trim() || "intake_submissions";

type UploadedFile = {
  name: string;
  url?: string;
};

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
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

function getConfiguredEnvValue(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function getIntakeDeliveryConfig() {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const notifyEmail = getConfiguredEnvValue(INTAKE_NOTIFY_EMAIL_ENV_NAMES);
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  return {
    resendApiKey,
    notifyEmail,
    fromEmail: process.env.INTAKE_FROM_EMAIL?.trim() || "Mission Atlas Intake <onboarding@resend.dev>",
    blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "",
    supabaseUrl,
    supabaseServiceRoleKey,
    hasEmailDelivery: Boolean(resendApiKey && notifyEmail),
    hasSupabaseDelivery: Boolean(supabaseUrl && supabaseServiceRoleKey),
  };
}

function missingIntakeEmailConfig({
  resendApiKey,
  notifyEmail,
}: {
  resendApiKey: string;
  notifyEmail: string;
}) {
  const missing: string[] = [];

  if (!resendApiKey) {
    missing.push("RESEND_API_KEY");
  }

  if (!notifyEmail) {
    missing.push(INTAKE_NOTIFY_EMAIL_ENV_NAMES.join(" or "));
  }

  return missing;
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

function totalFileSize(files: File[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatText(value: string) {
  return escapeHtml(value || "Not provided").replace(/\n/g, "<br />");
}

function buildEmailHtml({
  name,
  email,
  task,
  success,
  anythingElse,
  uploadedFiles,
  uploadedSuccessFiles,
}: IntakeSubmission) {
  const buildFileList = (files: UploadedFile[]) =>
    files.length
      ? `<ul>${files
          .map((file) =>
            file.url
              ? `<li><a href="${escapeHtml(file.url)}">${escapeHtml(file.name)}</a></li>`
              : `<li>${escapeHtml(file.name)} (attached to this email)</li>`,
          )
          .join("")}</ul>`
      : "<p>No files attached.</p>";

  return `
    <div style="font-family: Arial, sans-serif; color: #263246; line-height: 1.55;">
      <h1 style="color: #06194a;">New intake submission</h1>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email Address:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
      <h2 style="color: #06194a;">What are they trying to do?</h2>
      <p>${formatText(task)}</p>
      <h2 style="color: #06194a;">How they do it today</h2>
      ${buildFileList(uploadedFiles)}
      <h2 style="color: #06194a;">What success would look like</h2>
      <p>${formatText(success)}</p>
      <h2 style="color: #06194a;">Desired output files/screenshots</h2>
      ${buildFileList(uploadedSuccessFiles)}
      <h2 style="color: #06194a;">Anything else?</h2>
      <p>${formatText(anythingElse)}</p>
    </div>
  `;
}

function buildEmailText({
  name,
  email,
  task,
  success,
  anythingElse,
  uploadedFiles,
  uploadedSuccessFiles,
}: IntakeSubmission) {
  const buildFileLines = (files: UploadedFile[]) =>
    files.length
      ? files.map((file) => `- ${file.name}: ${file.url ?? "attached to this email"}`).join("\n")
      : "No files attached.";

  return `New intake submission\n\nName: ${name}\nEmail Address: ${email}\n\nWhat are they trying to do?\n${task || "Not provided"}\n\nHow they do it today\n${buildFileLines(uploadedFiles)}\n\nWhat success would look like\n${success || "Not provided"}\n\nDesired output files/screenshots\n${buildFileLines(uploadedSuccessFiles)}\n\nAnything else?\n${anythingElse || "Not provided"}`;
}

async function sendIntakeEmail({
  resendApiKey,
  notifyEmail,
  fromEmail,
  submission,
  attachments,
}: {
  resendApiKey: string;
  notifyEmail: string;
  fromEmail: string;
  submission: IntakeSubmission;
  attachments: EmailAttachment[];
}) {
  const resend = new Resend(resendApiKey);
  const emailResponse = await resend.emails.send({
    from: fromEmail,
    to: notifyEmail,
    replyTo: submission.email,
    subject: `New intake submission from ${submission.name}`,
    html: buildEmailHtml(submission),
    text: buildEmailText(submission),
    attachments,
  });

  if (emailResponse.error) {
    throw emailResponse.error;
  }
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

    // Configure either Supabase or Resend delivery in Vercel Project Settings > Environment Variables.
    // Supabase delivery needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    // Email delivery needs RESEND_API_KEY and INTAKE_NOTIFY_EMAIL.
    // BLOB_READ_WRITE_TOKEN is optional: when present, files are uploaded to Vercel Blob and linked in each delivery.
    const {
      resendApiKey,
      notifyEmail,
      fromEmail,
      blobToken,
      supabaseUrl,
      supabaseServiceRoleKey,
      hasEmailDelivery,
      hasSupabaseDelivery,
    } = getIntakeDeliveryConfig();

    if (!hasEmailDelivery && !hasSupabaseDelivery) {
      console.error("Intake delivery environment variables are not configured", {
        missingEmailConfig: missingIntakeEmailConfig({ resendApiKey, notifyEmail }),
        missingSupabaseConfig: missingSupabaseConfig({ supabaseUrl, supabaseServiceRoleKey }),
        expectedRecipientVariables: INTAKE_NOTIFY_EMAIL_ENV_NAMES,
      });
      return errorResponse(GENERIC_INTAKE_ERROR, 500);
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

    async function attachFiles(filesToAttach: File[]) {
      const attachments: EmailAttachment[] = [];

      for (const file of filesToAttach) {
        const content = Buffer.from(await file.arrayBuffer()).toString("base64");
        attachments.push({
          filename: safeFileName(file.name),
          content,
          contentType: file.type || "application/octet-stream",
        });
      }

      return attachments;
    }

    const allFiles = [...files, ...successFiles];
    const shouldUseBlobUploads = Boolean(blobToken);

    if (hasEmailDelivery && !shouldUseBlobUploads && totalFileSize(allFiles) > MAX_EMAIL_ATTACHMENT_BYTES) {
      return errorResponse("Please keep the combined upload size under 35MB, or send the larger files by email.");
    }

    const uploadedFiles = shouldUseBlobUploads
      ? await uploadFiles(files, "current-process")
      : files.map((file) => ({ name: file.name }));
    const uploadedSuccessFiles = shouldUseBlobUploads
      ? await uploadFiles(successFiles, "desired-output")
      : successFiles.map((file) => ({ name: file.name }));
    const attachments = hasEmailDelivery && !shouldUseBlobUploads ? await attachFiles(allFiles) : [];
    const submission = { name, email, task, success, anythingElse, uploadedFiles, uploadedSuccessFiles };

    let delivered = false;

    if (hasSupabaseDelivery) {
      try {
        await saveIntakeSubmissionToSupabase({ supabaseUrl, supabaseServiceRoleKey, submission });
        delivered = true;
      } catch (error) {
        console.error("Supabase intake submission insert failed", error);
      }
    }

    if (hasEmailDelivery) {
      try {
        await sendIntakeEmail({ resendApiKey, notifyEmail, fromEmail, submission, attachments });
        delivered = true;
      } catch (error) {
        console.error("Intake notification email failed", error);
      }
    }

    if (!delivered) {
      return errorResponse(GENERIC_INTAKE_ERROR, 500);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Intake submission failed", error);
    return errorResponse(GENERIC_INTAKE_ERROR, 500);
  }
}
