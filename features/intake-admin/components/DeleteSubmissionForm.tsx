type DeleteSubmissionFormProps = {
  submissionId: number | string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteSubmissionForm({
  submissionId,
  action,
}: DeleteSubmissionFormProps) {
  return (
    <form className="admin-delete-form" action={action}>
      <input type="hidden" name="id" value={submissionId} />
      <div>
        <strong>Delete this submission permanently</strong>
        <p>
          Removes the dashboard row from Supabase and deletes the uploaded files
          stored for this request in Vercel Blob. This cannot be undone.
        </p>
      </div>
      <label className="admin-delete-confirmation">
        <input type="checkbox" name="confirm_delete" value="delete" />
        <span>I understand this permanently deletes the request.</span>
      </label>
      <button className="admin-delete-button" type="submit">
        Delete submission
      </button>
    </form>
  );
}
