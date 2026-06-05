import { displayFileSize } from "../files";
import type { DisplayFile } from "../types";

export function FileList({ files }: { files: DisplayFile[] }) {
  if (files.length === 0) {
    return <p className="admin-empty">No files uploaded.</p>;
  }

  return (
    <ul className="admin-file-list">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`}>
          {file.downloadHref ? (
            <a href={file.downloadHref} target="_blank" rel="noreferrer">
              Download {file.name}
            </a>
          ) : (
            <span>{file.name}</span>
          )}
          <small>
            {file.downloadHref
              ? "Private file. A fresh signed download is generated when clicked."
              : file.downloadError}
          </small>
          {(file.size || file.contentType) && (
            <small>
              Metadata: {" "}
              {[displayFileSize(file.size), file.contentType]
                .filter(Boolean)
                .join(" · ")}
            </small>
          )}
          {file.blobFilePath && (
            <small>
              Vercel Blob path: <code>{file.blobFilePath}</code>
            </small>
          )}
          {file.blobFileName && (
            <small>
              Vercel Blob file: <code>{file.blobFileName}</code>
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}
