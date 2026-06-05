import type { DisplayFile, IntakeFile, IntakeSubmission } from "./types";

export function parseFiles(value: unknown): IntakeFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (file): file is IntakeFile => Boolean(file) && typeof file === "object",
  );
}

function pathnameFromBlobUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

function blobBasename(pathname: string) {
  const name = pathname.split("/").pop() ?? pathname;

  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function displayFileSize(size: number | null) {
  if (size === null || !Number.isFinite(size)) return null;

  return new Intl.NumberFormat("en-US", {
    style: "unit",
    unit: "byte",
    notation: "compact",
    unitDisplay: "narrow",
  }).format(size);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function displayFiles(files: IntakeFile[]): DisplayFile[] {
  return files.map((file) => {
    const originalUrl = stringValue(file.url) ?? stringValue(file.downloadUrl);
    const blobFilePath =
      stringValue(file.blob_file_path) ??
      stringValue(file.pathname) ??
      (originalUrl ? pathnameFromBlobUrl(originalUrl) || null : null);
    const blobFileName =
      stringValue(file.blob_file_name) ??
      (blobFilePath ? blobBasename(blobFilePath) : null);
    const name =
      stringValue(file.name) ??
      stringValue(file.filename) ??
      blobFileName ??
      "Uploaded file";
    const size = numberValue(file.size) ?? numberValue(file.blob_file_size);
    const contentType =
      stringValue(file.content_type) ??
      stringValue(file.blob_file_content_type);

    return {
      name,
      blobFilePath,
      blobFileName,
      size,
      contentType,
      downloadHref: blobFilePath
        ? `/api/admin/intake/files/download?${new URLSearchParams({ pathname: blobFilePath, filename: name })}`
        : null,
      downloadError: blobFilePath
        ? null
        : "Saved file is missing a permanent Vercel Blob pathname. Please re-upload this file.",
    };
  });
}

function normalizeIntakeBlobPath(pathname: string | null) {
  const normalized = pathname?.trim().replace(/^\/+/, "") ?? "";

  if (
    !normalized ||
    normalized.includes("..") ||
    !normalized.startsWith("intake/")
  ) {
    return null;
  }

  return normalized;
}

export function blobPathnamesForDelete(submission: IntakeSubmission) {
  const pathnames = [
    ...parseFiles(submission.current_process_files),
    ...parseFiles(submission.desired_output_files),
  ].flatMap((file) => {
    const originalUrl = stringValue(file.url) ?? stringValue(file.downloadUrl);
    const pathname =
      stringValue(file.blob_file_path) ??
      stringValue(file.pathname) ??
      (originalUrl ? pathnameFromBlobUrl(originalUrl) || null : null);
    const normalizedPathname = normalizeIntakeBlobPath(pathname);

    return normalizedPathname ? [normalizedPathname] : [];
  });

  return Array.from(new Set(pathnames));
}
