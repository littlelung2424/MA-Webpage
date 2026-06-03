"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
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

export default function IntakePage() {
  const [fields, setFields] = useState<IntakeFields>(initialFields);
  const [files, setFiles] = useState<File[]>([]);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedFilesLabel = useMemo(() => {
    if (files.length === 0) return "No files selected yet.";
    return files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`).join(", ");
  }, [files]);

  function updateField(field: keyof IntakeFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosenFiles = Array.from(event.target.files ?? []);
    const unsupportedFile = chosenFiles.find((file) => !ACCEPTED_EXTENSIONS.includes(extensionFor(file)));
    const oversizedFile = chosenFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);

    if (unsupportedFile) {
      setErrorMessage(`“${unsupportedFile.name}” is not a supported file type.`);
      setFormState("error");
      event.target.value = "";
      return;
    }

    if (oversizedFile) {
      setErrorMessage(`“${oversizedFile.name}” is over the 10MB limit.`);
      setFormState("error");
      event.target.value = "";
      return;
    }

    setFiles(chosenFiles);
    setErrorMessage("");
    if (formState === "error") setFormState("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const name = fields.name.trim();
    const email = fields.email.trim();
    const task = fields.task.trim();
    const success = fields.success.trim();

    if (!name || !email || !task || !success) {
      setErrorMessage("Please fill out the required fields.");
      setFormState("error");
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      setFormState("error");
      return;
    }

    const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFile) {
      setErrorMessage(`“${oversizedFile.name}” is over the 10MB limit.`);
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
    files.forEach((file) => body.append("files", file));

    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new Error("Intake submission failed");
      }

      setFields(initialFields);
      setFiles([]);
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

          <label className="file-field">
            <span>Show me how you do it today</span>
            <input name="files" type="file" multiple accept={ACCEPTED_TYPES} onChange={handleFiles} />
            <small>Optional. Upload screenshots or files up to 10MB each.</small>
            <em>{selectedFilesLabel}</em>
          </label>

          <label>
            <span>What would success look like? <strong aria-hidden="true">*</strong></span>
            <textarea
              name="success"
              required
              rows={4}
              placeholder="If a magic button existed, what would it do?"
              value={fields.success}
              onChange={(event) => updateField("success", event.target.value)}
            />
          </label>

          <label>
            <span>Anything else?</span>
            <textarea
              name="anythingElse"
              rows={4}
              value={fields.anythingElse}
              onChange={(event) => updateField("anythingElse", event.target.value)}
            />
          </label>

          <button type="submit" disabled={isLoading}>
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
