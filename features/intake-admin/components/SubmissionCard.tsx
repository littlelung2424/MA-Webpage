import {
  extraDetailsFor,
  formatDate,
  normalizeStatus,
  stringListValue,
} from "../data";
import type { DisplayFile, IntakeSubmission } from "../types";
import { DeleteSubmissionForm } from "./DeleteSubmissionForm";
import { FileList } from "./FileList";
import { StatusForm } from "./StatusForm";

type SubmissionCardProps = {
  submission: IntakeSubmission;
  currentFiles: DisplayFile[];
  desiredFiles: DisplayFile[];
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function SubmissionCard({
  submission,
  currentFiles,
  desiredFiles,
  updateAction,
  deleteAction,
}: SubmissionCardProps) {
  const extraDetails = extraDetailsFor(submission);
  const normalizedStatus = normalizeStatus(submission.status);

  return (
    <article className="admin-submission-card" key={submission.id}>
      <header className="admin-submission-header">
        <div>
          <h2>{submission.name || "Unnamed submission"}</h2>
          {submission.email && (
            <a href={`mailto:${submission.email}`}>{submission.email}</a>
          )}
        </div>
        <div className="admin-meta">
          <span
            className={`admin-status-pill status-${normalizedStatus.toLowerCase()}`}
          >
            {normalizedStatus}
          </span>
          <time dateTime={submission.created_at ?? undefined}>
            {formatDate(submission.created_at)}
          </time>
        </div>
      </header>

      <div className="admin-content-grid">
        <section>
          <h3>Tools or systems involved</h3>
          <p>
            {stringListValue(submission.tools_or_systems).join(", ") ||
              "No tools or systems selected."}
          </p>
        </section>
        <section>
          <h3>Anything else involved in the process?</h3>
          <p>
            {submission.process_involvement ||
              "No additional process details provided."}
          </p>
        </section>
        <section>
          <h3>Task / problem description</h3>
          <p>{submission.task || "No task description provided."}</p>
        </section>
        <section>
          <h3>Desired outcome</h3>
          <p>{submission.success || "No desired outcome provided."}</p>
        </section>
        <section>
          <h3>Anything else</h3>
          <p>{submission.anything_else || "No additional notes provided."}</p>
        </section>
        <section>
          <h3>Current process files</h3>
          <FileList files={currentFiles} />
        </section>
        <section>
          <h3>Desired output files</h3>
          <FileList files={desiredFiles} />
        </section>
      </div>

      {extraDetails.length > 0 && (
        <details className="admin-extra-details">
          <summary>Additional submission fields</summary>
          <dl>
            {extraDetails.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <StatusForm submission={submission} action={updateAction} />

      <DeleteSubmissionForm
        submissionId={submission.id}
        action={deleteAction}
      />
    </article>
  );
}
