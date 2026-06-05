"use client";

import type { ChangeEvent, ClipboardEvent, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GENERIC_INTAKE_ERROR, TOOL_OPTIONS } from "../constants";
import { formatFileLabel, pastedScreenshotName } from "../files";
import type {
  DictationField,
  FormState,
  IntakeFields,
  IntakeSpeechRecognition,
  IntakeSpeechRecognitionConstructor,
} from "../types";
import { isValidEmail, validateFiles } from "../validation";
import { DictationButton } from "./DictationButton";
import { FilePicker } from "./FilePicker";

const initialFields: IntakeFields = {
  name: "",
  email: "",
  toolsOrSystems: [],
  processInvolvement: "",
  task: "",
  success: "",
  anythingElse: "",
};

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

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  const speechWindow = window as Window & {
    SpeechRecognition?: IntakeSpeechRecognitionConstructor;
    webkitSpeechRecognition?: IntakeSpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function IntakeForm() {
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

  function updateField(
    field: Exclude<keyof IntakeFields, "toolsOrSystems">,
    value: string,
  ) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function toggleToolOrSystem(tool: string) {
    setFields((current) => {
      const toolsOrSystems = current.toolsOrSystems.includes(tool)
        ? current.toolsOrSystems.filter((selectedTool) => selectedTool !== tool)
        : [...current.toolsOrSystems, tool];

      return { ...current, toolsOrSystems };
    });
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
    const form = event.currentTarget;
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
    fields.toolsOrSystems.forEach((tool) => body.append("toolsOrSystems", tool));
    body.append("processInvolvement", fields.processInvolvement.trim());
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
      form.reset();
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

          <fieldset className="checkbox-field">
            <legend>What tools or systems are involved?</legend>
            <div className="checkbox-options">
              {TOOL_OPTIONS.map((tool) => (
                <label key={tool} className="checkbox-option">
                  <input
                    type="checkbox"
                    name="toolsOrSystems"
                    value={tool}
                    checked={fields.toolsOrSystems.includes(tool)}
                    onChange={() => toggleToolOrSystem(tool)}
                  />
                  <span>{tool}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            <span>Anything else involved in the process?</span>
            <textarea
              name="processInvolvement"
              rows={3}
              placeholder="Any any other tools, systems, or applications."
              value={fields.processInvolvement}
              onChange={(event) => updateField("processInvolvement", event.target.value)}
            />
          </label>

          <label>
            <span>What are you trying to do?</span>
            <div className="textarea-with-action">
              <textarea
                name="task"
                rows={5}
                placeholder="Describe the repetitive task, workflow, or report you need help with. Don't have time to describe, show us below."
                value={fields.task}
                onChange={(event) => updateField("task", event.target.value)}
              />
              <DictationButton
                field="task"
                listeningField={listeningField}
                inactiveLabel="Dictate what you are trying to do"
                activeLabel="Stop dictating what you are trying to do"
                onStart={startDictation}
              />
            </div>
          </label>

          <FilePicker
            acceptName="files"
            files={currentFiles}
            id="current-files"
            label="Show us how you do it today (Input)"
            listLabel="Current process screenshots and files"
            onChange={(event) => handleFiles(event, "current")}
            onPaste={(event) => handlePaste(event, "current")}
            onRemove={(index) => removeFile("current", index)}
            selectedLabel={currentFilesLabel}
          />

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
              <DictationButton
                field="success"
                listeningField={listeningField}
                inactiveLabel="Dictate what success would look like"
                activeLabel="Stop dictating what success would look like"
                onStart={startDictation}
              />
            </div>
          </label>

          <FilePicker
            acceptName="successFiles"
            files={successFiles}
            id="success-files"
            label="Show us your final product (Output)"
            listLabel="Desired output screenshots and files"
            onChange={(event) => handleFiles(event, "success")}
            onPaste={(event) => handlePaste(event, "success")}
            onRemove={(index) => removeFile("success", index)}
            selectedLabel={successFilesLabel}
          />

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
