export const SUPABASE_INTAKE_TABLE = process.env.SUPABASE_INTAKE_TABLE?.trim() || "intake_submissions";

export type SupabaseKeyDetails = {
  role: string | null;
  looksLikeJwt: boolean;
  kind: "legacy-service-role" | "legacy-anon" | "legacy-authenticated" | "secret" | "publishable" | "unknown" | "missing";
  elevated: boolean;
  configuredVariable: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_SECRET_KEY" | null;
};

type SupabaseConfig = {
  supabaseUrl: string;
  supabaseElevatedKey: string;
  keyDetails: SupabaseKeyDetails;
  missing: string[];
};

function decodeJwtRole(key: string) {
  const [, payload] = key.split(".");

  if (!payload) {
    return { role: null, looksLikeJwt: false };
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8")) as { role?: unknown };

    return {
      role: typeof decodedPayload.role === "string" ? decodedPayload.role : null,
      looksLikeJwt: true,
    };
  } catch {
    return { role: null, looksLikeJwt: true };
  }
}

function describeSupabaseKey(key: string, configuredVariable: SupabaseKeyDetails["configuredVariable"]): SupabaseKeyDetails {
  if (!key) {
    return { role: null, looksLikeJwt: false, kind: "missing", elevated: false, configuredVariable: null };
  }

  if (key.startsWith("sb_publishable_")) {
    return { role: "anon", looksLikeJwt: false, kind: "publishable", elevated: false, configuredVariable };
  }

  if (key.startsWith("sb_secret_")) {
    return { role: "service_role", looksLikeJwt: false, kind: "secret", elevated: true, configuredVariable };
  }

  const jwtDetails = decodeJwtRole(key);

  if (jwtDetails.looksLikeJwt && jwtDetails.role === "service_role") {
    return { ...jwtDetails, kind: "legacy-service-role", elevated: true, configuredVariable };
  }

  if (jwtDetails.looksLikeJwt && jwtDetails.role === "anon") {
    return { ...jwtDetails, kind: "legacy-anon", elevated: false, configuredVariable };
  }

  if (jwtDetails.looksLikeJwt && jwtDetails.role === "authenticated") {
    return { ...jwtDetails, kind: "legacy-authenticated", elevated: false, configuredVariable };
  }

  return { ...jwtDetails, kind: "unknown", elevated: false, configuredVariable };
}

export function getSupabaseConfig(): SupabaseConfig {
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const modernSecretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  const legacyKeyDetails = describeSupabaseKey(legacyServiceRoleKey, legacyServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null);
  const modernKeyDetails = describeSupabaseKey(modernSecretKey, modernSecretKey ? "SUPABASE_SECRET_KEY" : null);
  const keyDetails = modernKeyDetails.elevated
    ? modernKeyDetails
    : legacyKeyDetails.elevated
      ? legacyKeyDetails
      : legacyServiceRoleKey
        ? legacyKeyDetails
        : modernKeyDetails;
  const supabaseElevatedKey = keyDetails.configuredVariable === "SUPABASE_SECRET_KEY" ? modernSecretKey : legacyServiceRoleKey;
  const missing = [
    ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
    ...(!legacyServiceRoleKey && !modernSecretKey ? ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"] : []),
  ];

  return {
    supabaseUrl,
    supabaseElevatedKey,
    keyDetails,
    missing,
  };
}

export function supabaseHeaders(prefer?: string) {
  const { supabaseElevatedKey } = getSupabaseConfig();

  return {
    apikey: supabaseElevatedKey,
    Authorization: `Bearer ${supabaseElevatedKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function supabaseReadinessError() {
  const { missing, keyDetails } = getSupabaseConfig();

  if (missing.length > 0) {
    return `Missing required Supabase environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`;
  }

  if (keyDetails.kind === "publishable") {
    return `${keyDetails.configuredVariable} is currently a Supabase publishable/anon key. The admin dashboard needs an elevated server-only key: either set SUPABASE_SECRET_KEY to a Supabase sb_secret key or set SUPABASE_SERVICE_ROLE_KEY to the legacy service_role JWT for the same project as SUPABASE_URL.`;
  }

  if (keyDetails.looksLikeJwt && keyDetails.role && !keyDetails.elevated) {
    return `${keyDetails.configuredVariable} is currently a Supabase ${keyDetails.role} key. The admin dashboard must use an elevated server-only key so it can read submissions when Row Level Security is enabled.`;
  }

  return null;
}
