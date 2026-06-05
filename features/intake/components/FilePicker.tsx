import type { ChangeEvent, ClipboardEvent } from "react";
import { ACCEPTED_FILES_LABEL, ACCEPTED_TYPES } from "../constants";
import { UploadCloudIcon } from "./UploadCloudIcon";

type FilePickerProps = {
  acceptName: "files" | "successFiles";
  files: File[];
  id: string;
  label: string;
  listLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onRemove: (index: number) => void;
  selectedLabel: string;
};

export function FilePicker({
  acceptName,
  files,
  id,
  label,
  listLabel,
  onChange,
  onPaste,
  onRemove,
  selectedLabel,
}: FilePickerProps) {
  return (
    <div className="file-field" tabIndex={0} onPaste={onPaste}>
      <span>{label}</span>
      <input
        id={id}
        className="visually-hidden-file-input"
        name={acceptName}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={onChange}
      />
      <label className="file-picker" htmlFor={id}>
        <UploadCloudIcon />
        <span>Choose files</span>
      </label>
      <small>Upload files or paste screenshots here. Up to 10MB each.</small>
      <small>{ACCEPTED_FILES_LABEL}</small>
      {files.length > 0 && <em>{selectedLabel}</em>}
      {files.length > 0 && (
        <ul className="selected-file-list" aria-label={listLabel}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <button type="button" onClick={() => onRemove(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
