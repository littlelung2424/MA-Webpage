export const STATUS_OPTIONS = ["New", "Reviewing", "Done"] as const;

export type IntakeStatus = (typeof STATUS_OPTIONS)[number];

export type IntakeFile = {
  name?: unknown;
  url?: unknown;
  downloadUrl?: unknown;
  pathname?: unknown;
  filename?: unknown;
  size?: unknown;
  content_type?: unknown;
  blob_file_path?: unknown;
  blob_file_name?: unknown;
  blob_file_size?: unknown;
  blob_file_content_type?: unknown;
};

export type IntakeSubmission = {
  id: number | string;
  created_at?: string | null;
  name?: string | null;
  email?: string | null;
  tools_or_systems?: unknown;
  process_involvement?: string | null;
  task?: string | null;
  success?: string | null;
  anything_else?: string | null;
  current_process_files?: unknown;
  desired_output_files?: unknown;
  status?: string | null;
  internal_notes?: string | null;
  [key: string]: unknown;
};

export type DisplayFile = {
  name: string;
  downloadHref: string | null;
  downloadError: string | null;
  blobFilePath: string | null;
  blobFileName: string | null;
  size: number | null;
  contentType: string | null;
};

export type SubmissionWithFiles = {
  submission: IntakeSubmission;
  currentFiles: DisplayFile[];
  desiredFiles: DisplayFile[];
};
