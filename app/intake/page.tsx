"use client";

import type { ChangeEvent, ClipboardEvent, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 12;
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx", "csv"];
const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.csv";
const ACCEPTED_FILES_LABEL = "Accepted files: PNG, JPG, JPEG, PDF, DOC, DOCX, XLS, XLSX, CSV.";

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

const GENERIC_INTAKE_ERROR = "Something went wrong while sending your request. Please try again, or email us directly if it keeps happening.";

function readableDictationError(error?: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Please allow microphone access in your browser settings, or type your response instead.";
    case "no-speech":
      return "We didn’t hear anything. Please try dictating again, or type your response instead.";
    case "audio-capture":
      return "We couldn’t find a working microphone. Please check your microphone, or type your response instead.";
    case "network":
      return "Dictation lost its connection. Please try again, or type your response instead.";
    case "aborted":
      return "Dictation was stopped before we could capture anything. You can try again or type your response.";
    default:
      return "Voice dictation stopped before we could capture your response. Please try again, or type your response instead.";
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extensionFor(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function formatFileLabel(files: File[]) {
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

function UploadCloudIcon() {
  return (
    <svg className="upload-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 16V7" />
      <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
      <path d="M8 17.5H7.25a4.25 4.25 0 0 1-.66-8.45 5.75 5.75 0 0 1 10.95-1.52A4.75 4.75 0 0 1 17.5 17.5H16" />
    </svg>
  );
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

  function showError(message: string) {
    setErrorMessage(message);
    setFormState("error");
  }

  function clearStatusMessage() {
    setErrorMessage("");
    setFormState((currentState) => (currentState === "error" || currentState === "success" ? "idle" : currentState));
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
      showError("Voice dictation is not supported in this browser. You can still type or paste your response.");
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
      showError(readableDictationError(event.error));
    };

    recognition.onend = () => {
      setListeningField((currentField) => (currentField === field ? null : currentField));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListeningField(field);
    clearStatusMessage();

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListeningField(null);
      showError("Dictation could not start. Please try again, or type your response instead.");
    }
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
        showError(validationError);
        if (inputToReset) inputToReset.value = "";
        return existingFiles;
      }

      clearStatusMessage();
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
    clearStatusMessage();

    const name = fields.name.trim();
    const email = fields.email.trim();
    const task = fields.task.trim();
    const success = fields.success.trim();

    if (!name || !email) {
      showError("Please enter your name and email address so we know who to contact.");
      return;
    }

    if (!isValidEmail(email)) {
      showError("Please enter a valid email address, like name@example.com.");
      return;
    }

    const currentFilesError = validateFiles(currentFiles);
    const successFilesError = validateFiles(successFiles);
    if (currentFilesError || successFilesError) {
      showError(currentFilesError || successFilesError);
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
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || GENERIC_INTAKE_ERROR);
      }

      setFields(initialFields);
      setCurrentFiles([]);
      setSuccessFiles([]);
      event.currentTarget.reset();
      setFormState("success");
    } catch (error) {
      showError(error instanceof Error && error.message ? error.message : GENERIC_INTAKE_ERROR);
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
            Tell us what's slowing you down. A few screenshots are all we need.
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
            <input
              id="current-files"
              className="visually-hidden-file-input"
              name="files"
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={(event) => handleFiles(event, "current")}
            />
            <label className="file-picker" htmlFor="current-files">
              <UploadCloudIcon />
              <span>Choose files</span>
            </label>
            <small>Upload files or paste screenshots here. Up to 10MB each.</small>
            <small>{ACCEPTED_FILES_LABEL}</small>
            {currentFiles.length > 0 && <em>{currentFilesLabel}</em>}
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
              id="success-files"
              className="visually-hidden-file-input"
              name="successFiles"
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={(event) => handleFiles(event, "success")}
            />
            <label className="file-picker" htmlFor="success-files">
              <UploadCloudIcon />
              <span>Choose files</span>
            </label>
            <small>Upload files or paste screenshots here. Up to 10MB each.</small>
            <small>{ACCEPTED_FILES_LABEL}</small>
            {successFiles.length > 0 && <em>{successFilesLabel}</em>}
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
            {formState === "success" && (
              <div className="status-message success" role="status">
                <p>Got it — thanks for sending this over.</p>
                <button type="button" aria-label="Dismiss success message" onClick={clearStatusMessage}>
                  ×
                </button>
              </div>
            )}
            {formState === "error" && (
              <div className="status-message error" role="alert">
                <p>{errorMessage || GENERIC_INTAKE_ERROR}</p>
                <button type="button" aria-label="Dismiss error message" onClick={clearStatusMessage}>
                  ×
                </button>
              </div>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
