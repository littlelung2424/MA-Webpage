"use client";

import type { ChangeEvent, ClipboardEvent, FormEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"];
const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.csv";

type FormState = "idle" | "loading" | "success" | "error";

type IntakeFields = {
  name: string;
  email: string;
  task: string;
  success: string;
  anythingElse: string;
};

const initialFields: IntakeFields = {
  name: "",
  email: "",
  task: "",
  success: "",
  anythingElse: "",
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extensionFor(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function formatFileLabel(files: File[]) {
  if (files.length === 0) return "No screenshots or files selected yet.";
  return files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`).join(", ");
}

function pastedScreenshotName(index: number) {
  return `pasted-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}.png`;
}

export default function IntakePage() {
  const [fields, setFields] = useState<IntakeFields>(initialFields);
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);
  const [successFiles, setSuccessFiles] = useState<File[]>([]);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const currentFilesLabel = useMemo(() => formatFileLabel(currentFiles), [currentFiles]);
  const successFilesLabel = useMemo(() => formatFileLabel(successFiles), [successFiles]);

  function updateField(field: keyof IntakeFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function validateFiles(filesToValidate: File[]) {
    const unsupportedFile = filesToValidate.find((file) => !ACCEPTED_EXTENSIONS.includes(extensionFor(file)));
    const oversizedFile = filesToValidate.find((file) => file.size > MAX_FILE_SIZE_BYTES);

    if (unsupportedFile) return `“${unsupportedFile.name}” is not a supported file type.`;
    if (oversizedFile) return `“${oversizedFile.name}” is over the 10MB limit.`;
    if (filesToValidate.length > MAX_FILE_COUNT) return `Please keep each section to ${MAX_FILE_COUNT} files or fewer.`;
    return "";
  }

  function applyFiles(
    incomingFiles: File[],
    updateFiles: (value: SetStateAction<File[]>) => void,
    inputToReset?: HTMLInputElement,
  ) {
    if (incomingFiles.length === 0) return;

    updateFiles((existingFiles) => {
      const nextFiles = [...existingFiles, ...incomingFiles];
      const validationError = validateFiles(nextFiles);

      if (validationError) {
        setErrorMessage(validationError);
        setFormState("error");
        if (inputToReset) inputToReset.value = "";
        return existingFiles;
      }

      setErrorMessage("");
      if (formState === "error") setFormState("idle");
      return nextFiles;
    });
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>, kind: "current" | "success") {
    const updateFiles = kind === "current" ? setCurrentFiles : setSuccessFiles;
    applyFiles(Array.from(event.target.files ?? []), updateFiles, event.target);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>, kind: "current" | "success") {
    const pastedImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item, index) => {
        const file = item.getAsFile();
        return file ? new File([file], pastedScreenshotName(index), { type: file.type || "image/png" }) : null;
      })
      .filter((file): file is File => Boolean(file));

    if (pastedImages.length === 0) return;

    event.preventDefault();
    applyFiles(pastedImages, kind === "current" ? setCurrentFiles : setSuccessFiles);
  }

  function removeFile(kind: "current" | "success", indexToRemove: number) {
    const updateFiles = kind === "current" ? setCurrentFiles : setSuccessFiles;
    updateFiles((existingFiles) => existingFiles.filter((_, index) => index !== indexToRemove));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const name = fields.name.trim();
    const email = fields.email.trim();
    const task = fields.task.trim();
    const success = fields.success.trim();

    if (!name || !email || !task || (!success && successFiles.length === 0)) {
      setErrorMessage("Please fill out the required fields.");
      setFormState("error");
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      setFormState("error");
      return;
    }

    const currentFilesError = validateFiles(currentFiles);
    const successFilesError = validateFiles(successFiles);
    if (currentFilesError || successFilesError) {
      setErrorMessage(currentFilesError || successFilesError);
      setFormState("error");
      return;
    }

    setFormState("loading");

    const body = new FormData();
    body.append("name", name);
    body.append("email", email);
    body.append("task", task);
    body.append("success", success);
    body.append("anythingElse", fields.anythingElse.trim());
    currentFiles.forEach((file) => body.append("files", file));
    successFiles.forEach((file) => body.append("successFiles", file));

    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new Error("Intake submission failed");
      }

      setFields(initialFields);
      setCurrentFiles([]);
      setSuccessFiles([]);
      event.currentTarget.reset();
      setFormState("success");
    } catch {
      setErrorMessage("Something went wrong. Please try again or email me directly.");
      setFormState("error");
    }
  }

  const isLoading = formState === "loading";

  return (
    <main className="intake-page">
      <section className="intake-card" aria-labelledby="intake-title">
        <div className="intro-block">
          <p className="eyebrow">Quick automation idea</p>
          <h1 id="intake-title">What are you working on?</h1>
          <p className="intro-copy">
            Have a repetitive task, messy spreadsheet, annoying workflow, or process you wish was easier? Send me a
            quick example of what you’re dealing with.
          </p>
        </div>

        <form className="intake-form" onSubmit={handleSubmit} noValidate>
          <div className="field-grid two-columns">
            <label>
              <span>Name <strong aria-hidden="true">*</strong></span>
              <input
                name="name"
                autoComplete="name"
                required
                value={fields.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </label>

            <label>
              <span>Email Address <strong aria-hidden="true">*</strong></span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </label>
          </div>

          <label>
            <span>What are you trying to do? <strong aria-hidden="true">*</strong></span>
            <textarea
              name="task"
              required
              rows={5}
              placeholder="Describe the task, process, report, spreadsheet, email workflow, or repetitive thing that takes too much time."
              value={fields.task}
              onChange={(event) => updateField("task", event.target.value)}
            />
          </label>

          <div className="file-field" tabIndex={0} onPaste={(event) => handlePaste(event, "current")}>
            <span>Show me how you do it today</span>
            <input name="files" type="file" multiple accept={ACCEPTED_TYPES} onChange={(event) => handleFiles(event, "current")} />
            <small>Optional. Upload files or paste screenshots here with Ctrl+V / Cmd+V. Up to 10MB each.</small>
            <em>{currentFilesLabel}</em>
            {currentFiles.length > 0 && (
              <ul className="selected-file-list" aria-label="Current process screenshots and files">
                {currentFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" onClick={() => removeFile("current", index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label>
            <span>What would success look like? <strong aria-hidden="true">*</strong></span>
            <textarea
              name="success"
              rows={5}
              placeholder="Describe the task, process, report, spreadsheet, email workflow, or repetitive thing that takes too much time."
              value={fields.success}
              onChange={(event) => updateField("success", event.target.value)}
            />
          </label>

          <div className="file-field" tabIndex={0} onPaste={(event) => handlePaste(event, "success")}>
            <span>Upload or paste the output file/screenshots</span>
            <input
              name="successFiles"
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={(event) => handleFiles(event, "success")}
            />
            <small>Required if you do not describe success above. Add the final report, spreadsheet, email, or screenshots you want back.</small>
            <em>{successFilesLabel}</em>
            {successFiles.length > 0 && (
              <ul className="selected-file-list" aria-label="Desired output screenshots and files">
                {successFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" onClick={() => removeFile("success", index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label>
            <span>Anything else?</span>
            <textarea
              name="anythingElse"
              rows={4}
              value={fields.anythingElse}
              onChange={(event) => updateField("anythingElse", event.target.value)}
            />
          </label>

          <button className="submit-button" type="submit" disabled={isLoading}>
            {isLoading ? "Sending…" : "Send it over"}
          </button>

          <div className="status" aria-live="polite">
            {formState === "success" && <p className="success">Got it — thanks for sending this over.</p>}
            {formState === "error" && <p className="error">{errorMessage || "Something went wrong. Please try again or email me directly."}</p>}
          </div>
        </form>
      </section>
    </main>
  );
}
