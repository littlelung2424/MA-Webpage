"use client";

import type { ChangeEvent, ClipboardEvent, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"];
const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.csv";

type FormState = "idle" | "loading" | "success" | "error";
type DictationField = "task" | "success";

type IntakeSpeechRecognitionResult = {
  readonly length: number;
  item(index: number): { transcript: string } | undefined;
  [index: number]: { transcript: string } | undefined;
};

type IntakeSpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): IntakeSpeechRecognitionResult;
    [index: number]: IntakeSpeechRecognitionResult;
  };
};

type IntakeSpeechRecognitionErrorEvent = {
  readonly error?: string;
};

type IntakeSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onend: (() => void) | null;
  onerror: ((event: IntakeSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: IntakeSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type IntakeSpeechRecognitionConstructor = new () => IntakeSpeechRecognition;

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

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  const speechWindow = window as Window & {
    SpeechRecognition?: IntakeSpeechRecognitionConstructor;
    webkitSpeechRecognition?: IntakeSpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export default function IntakePage() {
  const [fields, setFields] = useState<IntakeFields>(initialFields);
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);
  const [successFiles, setSuccessFiles] = useState<File[]>([]);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [listeningField, setListeningField] = useState<DictationField | null>(null);
  const recognitionRef = useRef<IntakeSpeechRecognition | null>(null);

  const currentFilesLabel = useMemo(() => formatFileLabel(currentFiles), [currentFiles]);
  const successFilesLabel = useMemo(() => formatFileLabel(successFiles), [successFiles]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function updateField(field: keyof IntakeFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function appendDictation(field: DictationField, transcript: string) {
    setFields((current) => {
      const existingText = current[field].trim();
      const nextText = existingText ? `${existingText} ${transcript}` : transcript;
      return { ...current, [field]: nextText };
    });
  }

  function startDictation(field: DictationField) {
    if (listeningField === field && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      setErrorMessage("Voice dictation is not supported in this browser. You can still type or paste your response.");
      setFormState("error");
      return;
    }

    recognitionRef.current?.abort();

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results.item(index))
        .slice(event.resultIndex)
        .map((result) => result.item(0)?.transcript ?? result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) appendDictation(field, transcript);
    };

    recognition.onerror = (event) => {
      setErrorMessage(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Please allow microphone access or type your response."
          : "Voice dictation stopped. Please try again or type your response.",
      );
      setFormState("error");
    };

    recognition.onend = () => {
      setListeningField((currentField) => (currentField === field ? null : currentField));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListeningField(field);
    setErrorMessage("");
    if (formState === "error") setFormState("idle");
    recognition.start();
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

    if (!name || !email) {
      setErrorMessage("Please enter your name and email address.");
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
          <h1 id="intake-title">How Can We Help</h1>
          <p className="intro-copy">
            Have a repetitive task, messy spreadsheet, annoying workflow, or process you wish was easier? Share your pain.
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
            <span>What are you trying to do?</span>
            <div className="textarea-with-action">
              <textarea
                name="task"
                rows={5}
                placeholder="Describe the task, process, report, spreadsheet, workflow, or repetitive thing that takes too long. Don't have time to describe, show us below."
                value={fields.task}
                onChange={(event) => updateField("task", event.target.value)}
              />
              <button
                className={`dictation-button${listeningField === "task" ? " is-listening" : ""}`}
                type="button"
                aria-label={listeningField === "task" ? "Stop dictating what you are trying to do" : "Dictate what you are trying to do"}
                aria-pressed={listeningField === "task"}
                onClick={() => startDictation("task")}
              >
                {listeningField === "task" ? "Listening…" : "🎙️ Dictate"}
              </button>
            </div>
          </label>

          <div className="file-field" tabIndex={0} onPaste={(event) => handlePaste(event, "current")}>
            <span>Show us how you do it today (Input)</span>
            <input name="files" type="file" multiple accept={ACCEPTED_TYPES} onChange={(event) => handleFiles(event, "current")} />
            <small>Upload files or paste screenshots here. Up to 10MB each.</small>
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
            <span>What does success look like?</span>
            <div className="textarea-with-action">
              <textarea
                name="success"
                rows={5}
                placeholder="Describe the final outcome and or output you want to see. Don't have time to describe, show us below."
                value={fields.success}
                onChange={(event) => updateField("success", event.target.value)}
              />
              <button
                className={`dictation-button${listeningField === "success" ? " is-listening" : ""}`}
                type="button"
                aria-label={listeningField === "success" ? "Stop dictating what success would look like" : "Dictate what success would look like"}
                aria-pressed={listeningField === "success"}
                onClick={() => startDictation("success")}
              >
                {listeningField === "success" ? "Listening…" : "🎙️ Dictate"}
              </button>
            </div>
          </label>

          <div className="file-field" tabIndex={0} onPaste={(event) => handlePaste(event, "success")}>
            <span>Show us your final product (Output)</span>
            <input
              name="successFiles"
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={(event) => handleFiles(event, "success")}
            />
            <small>Upload files or paste screenshots here. Up to 10MB each.</small>
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
            {isLoading ? "Sending…" : "Submit"}
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
