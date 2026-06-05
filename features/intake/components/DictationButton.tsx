import type { DictationField } from "../types";

type DictationButtonProps = {
  field: DictationField;
  listeningField: DictationField | null;
  inactiveLabel: string;
  activeLabel: string;
  onStart: (field: DictationField) => void;
};

export function DictationButton({
  field,
  listeningField,
  inactiveLabel,
  activeLabel,
  onStart,
}: DictationButtonProps) {
  const isListening = listeningField === field;

  return (
    <button
      className={`dictation-button${isListening ? " is-listening" : ""}`}
      type="button"
      aria-label={isListening ? activeLabel : inactiveLabel}
      aria-pressed={isListening}
      onClick={() => onStart(field)}
    >
      {isListening ? "Listening…" : "🎙️ Dictate"}
    </button>
  );
}
