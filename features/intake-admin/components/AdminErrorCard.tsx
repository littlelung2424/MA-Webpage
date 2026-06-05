type AdminErrorCardProps = {
  message: string;
  tableName: string;
};

export function AdminErrorCard({ message, tableName }: AdminErrorCardProps) {
  return (
    <div className="admin-error-card" role="status">
      <strong>Admin dashboard could not load submissions.</strong>
      <p>{message}</p>
      <p>
        Check the Vercel environment variables for this deployment, confirm the
        Supabase table exists, then redeploy if you changed settings.
      </p>
      <p>
        Open <a href="/api/admin/intake/debug">/api/admin/intake/debug</a> while
        signed in with admin Basic Auth to see safe runtime diagnostics for the
        deployed Supabase URL, key type, and REST probe status.
      </p>
      <p>
        Table configured for this deployment: <code>{tableName}</code>.
      </p>
    </div>
  );
}
