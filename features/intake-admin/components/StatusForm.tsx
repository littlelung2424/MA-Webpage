import { normalizeStatus } from "../data";
import { STATUS_OPTIONS, type IntakeSubmission } from "../types";

type StatusFormProps = {
  submission: IntakeSubmission;
  action: (formData: FormData) => Promise<void>;
};

export function StatusForm({ submission, action }: StatusFormProps) {
  return (
    <form className="admin-update-form" action={action}>
      <input type="hidden" name="id" value={submission.id} />
      <label>
        <span>Status</span>
        <select name="status" defaultValue={normalizeStatus(submission.status)}>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Internal notes</span>
        <textarea
          name="internal_notes"
          rows={4}
          defaultValue={submission.internal_notes ?? ""}
          placeholder="Private admin notes"
        />
      </label>
      <button className="submit-button admin-save-button" type="submit">
        Save updates
      </button>
    </form>
  );
}
