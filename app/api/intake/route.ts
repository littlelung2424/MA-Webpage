import { put } from "@vercel/blob";
import { Resend } from "resend";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"]);
const ACCEPTED_FILE_TYPES_LABEL = "PNG, JPG, PDF, Word, Excel, or CSV";
const GENERIC_INTAKE_ERROR =
  "Something went wrong while sending your request. Please try again, or email us directly if it keeps happening.";

type UploadedFile = {
  name: string;
  url: string;
};

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
}: {
  name: string;
  email: string;
  task: string;
  success: string;
  anythingElse: string;
  uploadedFiles: UploadedFile[];
  uploadedSuccessFiles: UploadedFile[];
}) {
  const buildFileList = (files: UploadedFile[]) =>
    files.length
      ? `<ul>${files
          .map((file) => `<li><a href="${escapeHtml(file.url)}">${escapeHtml(file.name)}</a></li>`)
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
}: {
  name: string;
  email: string;
  task: string;
  success: string;
  anythingElse: string;
  uploadedFiles: UploadedFile[];
  uploadedSuccessFiles: UploadedFile[];
}) {
  const buildFileLines = (files: UploadedFile[]) =>
    files.length ? files.map((file) => `- ${file.name}: ${file.url}`).join("\n") : "No files attached.";

  return `New intake submission\n\nName: ${name}\nEmail Address: ${email}\n\nWhat are they trying to do?\n${task || "Not provided"}\n\nHow they do it today\n${buildFileLines(uploadedFiles)}\n\nWhat success would look like\n${success || "Not provided"}\n\nDesired output files/screenshots\n${buildFileLines(uploadedSuccessFiles)}\n\nAnything else?\n${anythingElse || "Not provided"}`;
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

    // Configure these in Vercel Project Settings > Environment Variables:
    // RESEND_API_KEY, BLOB_READ_WRITE_TOKEN, and INTAKE_NOTIFY_EMAIL.
    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.INTAKE_NOTIFY_EMAIL;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    if (!resendApiKey || !notifyEmail || !blobToken) {
      console.error("Intake notification environment variables are not configured");
      return errorResponse(GENERIC_INTAKE_ERROR, 500);
    }

    async function uploadFiles(filesToUpload: File[], folder: string) {
      const uploaded: UploadedFile[] = [];

      for (const file of filesToUpload) {
        const blob = await put(`intake/${folder}/${Date.now()}-${safeFileName(file.name)}`, file, {
          access: "public",
          addRandomSuffix: true,
          // Uses BLOB_READ_WRITE_TOKEN from the Vercel environment. Do not hardcode this secret.
          token: blobToken,
        });

        uploaded.push({ name: file.name, url: blob.url });
      }

      return uploaded;
    }

    const uploadedFiles = await uploadFiles(files, "current-process");
    const uploadedSuccessFiles = await uploadFiles(successFiles, "desired-output");

    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "Mission Atlas Intake <onboarding@resend.dev>",
      to: notifyEmail,
      replyTo: email,
      subject: `New intake submission from ${name}`,
      html: buildEmailHtml({ name, email, task, success, anythingElse, uploadedFiles, uploadedSuccessFiles }),
      text: buildEmailText({ name, email, task, success, anythingElse, uploadedFiles, uploadedSuccessFiles }),
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Intake submission failed", error);
    return errorResponse(GENERIC_INTAKE_ERROR, 500);
  }
}
