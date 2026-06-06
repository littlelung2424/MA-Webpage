import "../../../features/intake/intake.css";
import "../../../features/intake-admin/admin.css";
import { SUPABASE_INTAKE_TABLE } from "../../../lib/intakeSupabase";
import {
  deleteSubmission,
  updateSubmission,
} from "../../../features/intake-admin/actions";
import {
  fetchSubmissions,
  submissionsWithDisplayFiles,
} from "../../../features/intake-admin/data";
import { AdminErrorCard } from "../../../features/intake-admin/components/AdminErrorCard";
import { SubmissionCard } from "../../../features/intake-admin/components/SubmissionCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminIntakePage() {
  const { submissions, error } = await fetchSubmissions();
  const submissionsWithFiles = error
    ? []
    : submissionsWithDisplayFiles(submissions);

  return (
    <main className="intake-page admin-page">
      <section className="intake-card admin-card">
        <div className="intro-block admin-intro">
          <p className="eyebrow">Private admin</p>
          <h1>Submission Dashboard</h1>
          <p className="intro-copy">
            Review active requests, securely download private uploads through
            fresh server-generated Blob links, keep status and internal notes up
            to date, or permanently delete a submission and its Vercel Blob
            uploads. Done submissions stay saved in Supabase but leave this
            dashboard.
          </p>
        </div>

        {error ? (
          <AdminErrorCard message={error} tableName={SUPABASE_INTAKE_TABLE} />
        ) : (
          <div className="admin-toolbar">
            <strong>{submissions.length}</strong> active submission
            {submissions.length === 1 ? "" : "s"} shown, newest first. Done
            submissions are hidden.
          </div>
        )}

        <div className="admin-submission-list">
          {!error && submissionsWithFiles.length === 0 && (
            <p className="admin-empty-card">No active intake submissions yet.</p>
          )}

          {submissionsWithFiles.map(
            ({ submission, currentFiles, desiredFiles }) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                currentFiles={currentFiles}
                desiredFiles={desiredFiles}
                updateAction={updateSubmission}
                deleteAction={deleteSubmission}
              />
            ),
          )}
        </div>
      </section>
    </main>
  );
}
