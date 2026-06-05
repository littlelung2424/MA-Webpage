import {
  ACCEPTED_EXTENSION_SET,
  ACCEPTED_FILE_TYPES_LABEL,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
} from "./constants";
import { extensionFor } from "./files";

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateFiles(filesToValidate: File[]) {
  const unsupportedFile = filesToValidate.find((file) => !ACCEPTED_EXTENSION_SET.has(extensionFor(file.name)));
  const oversizedFile = filesToValidate.find((file) => file.size > MAX_FILE_SIZE_BYTES);

  if (unsupportedFile) return `“${unsupportedFile.name}” is not a supported file type.`;
  if (oversizedFile) return `“${oversizedFile.name}” is over the 10MB limit.`;
  if (filesToValidate.length > MAX_FILE_COUNT) return `Please keep each section to ${MAX_FILE_COUNT} files or fewer.`;
  return "";
}

export function validateServerFiles(fileSets: File[][]) {
  for (const fileSet of fileSets) {
    if (fileSet.length > MAX_FILE_COUNT) {
      return `Please keep each file section to ${MAX_FILE_COUNT} files or fewer.`;
    }
  }

  for (const file of fileSets.flat()) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `“${file.name}” is over the 10MB limit. Please choose a smaller file and try again.`;
    }

    if (!ACCEPTED_EXTENSION_SET.has(extensionFor(file.name))) {
      return `“${file.name}” is not a supported file type. Please upload a ${ACCEPTED_FILE_TYPES_LABEL} file.`;
    }
  }

  return "";
}
