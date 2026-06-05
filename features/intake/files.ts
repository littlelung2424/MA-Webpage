export function extensionFor(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function formatFileLabel(files: File[]) {
  return files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`).join(", ");
}

export function pastedScreenshotName(index: number) {
  return `pasted-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}.png`;
}

export function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function blobFileName(pathname: string) {
  return pathname.split("/").pop() || pathname;
}
