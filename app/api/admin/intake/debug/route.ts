import { getSupabaseConfig, SUPABASE_INTAKE_TABLE, supabaseHeaders, supabaseReadinessError } from "../../../../../lib/intakeSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiagnosticResult = {
  table: string;
  supabaseUrlHost: string | null;
  supabaseProjectRef: string | null;
  configuredKeyVariable: string | null;
  configuredKeyKind: string;
  configuredKeyRole: string | null;
  configuredKeyIsElevated: boolean;
  readinessError: string | null;
  recommendedFix: string | null;
  restProbe: {
    attempted: boolean;
    status: number | null;
    ok: boolean | null;
    responseSnippet: string | null;
  };
  blobSigning: {
    hasReadWriteToken: boolean;
    hasBlobStoreId: boolean;
    hasVercelOidcEnvToken: boolean;
    recommendedFix: string | null;
  };
};

function hostAndProjectRef(supabaseUrl: string) {
  try {
    const host = new URL(supabaseUrl).host;
    return {
      host,
      projectRef: host.endsWith(".supabase.co") ? host.split(".")[0] : null,
    };
  } catch {
    return { host: null, projectRef: null };
  }
}

function compactSnippet(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 500) : null;
}

function blobSigningDiagnostics() {
  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasBlobStoreId = Boolean(process.env.BLOB_STORE_ID?.trim());
  const hasVercelOidcEnvToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());

  return {
    hasReadWriteToken,
    hasBlobStoreId,
    hasVercelOidcEnvToken,
    recommendedFix: hasReadWriteToken || hasBlobStoreId
      ? null
      : "Blob signing needs either BLOB_READ_WRITE_TOKEN or an OIDC-connected Blob store with BLOB_STORE_ID. Connect the Vercel Blob store to this project/environment, then redeploy.",
  };
}

function recommendedFixForSupabaseError(responseText: string) {
  if (responseText.includes('"code":"42501"') || responseText.includes("permission denied for table")) {
    return "Supabase is authenticating as service_role, but that database role has not been granted SELECT on public.intake_submissions yet. Apply supabase/migrations/20260604010000_grant_intake_service_role_access.sql to this Supabase project, then reload /admin/intake.";
  }

  return null;
}

export async function GET() {
  const { supabaseUrl, keyDetails } = getSupabaseConfig();
  const readinessError = supabaseReadinessError();
  const { host, projectRef } = hostAndProjectRef(supabaseUrl);
  const result: DiagnosticResult = {
    table: SUPABASE_INTAKE_TABLE,
    supabaseUrlHost: host,
    supabaseProjectRef: projectRef,
    configuredKeyVariable: keyDetails.configuredVariable,
    configuredKeyKind: keyDetails.kind,
    configuredKeyRole: keyDetails.role,
    configuredKeyIsElevated: keyDetails.elevated,
    readinessError,
    recommendedFix: null,
    restProbe: {
      attempted: false,
      status: null,
      ok: null,
      responseSnippet: null,
    },
    blobSigning: blobSigningDiagnostics(),
  };

  if (readinessError || !supabaseUrl) {
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const searchParams = new URLSearchParams({
      select: "id",
      limit: "1",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_INTAKE_TABLE}?${searchParams}`, {
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    const responseText = response.ok ? "" : await response.text();

    result.recommendedFix = recommendedFixForSupabaseError(responseText);
    result.restProbe = {
      attempted: true,
      status: response.status,
      ok: response.ok,
      responseSnippet: response.ok ? null : compactSnippet(responseText),
    };
  } catch (error) {
    result.restProbe = {
      attempted: true,
      status: null,
      ok: false,
      responseSnippet: error instanceof Error ? error.message : "Unknown Supabase probe error",
    };
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
