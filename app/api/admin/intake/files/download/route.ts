import { issueSignedToken, presignUrl } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_MS = 1000 * 60 * 15;
const INTAKE_BLOB_PREFIX = "intake/";

function unauthorized(message = "Authentication required") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Mission Atlas Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function forbidden(message: string, status = 403) {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parseBasicAuth(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) return null;

  try {
    const credentials = Buffer.from(
      authorizationHeader.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separatorIndex = credentials.indexOf(":");

    if (separatorIndex === -1) return null;

    return {
      username: credentials.slice(0, separatorIndex),
      password: credentials.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function verifyAdminAccess(request: NextRequest) {
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminUsername || !adminPassword) {
    return forbidden(
      "Admin access is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.",
      503,
    );
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));

  if (!credentials) {
    return unauthorized();
  }

  if (
    credentials.username !== adminUsername ||
    credentials.password !== adminPassword
  ) {
    return unauthorized("Invalid admin credentials");
  }

  return null;
}

function normalizePathname(pathname: string | null) {
  const normalized = pathname?.trim().replace(/^\/+/, "") ?? "";

  if (
    !normalized ||
    normalized.includes("..") ||
    !normalized.startsWith(INTAKE_BLOB_PREFIX)
  ) {
    return null;
  }

  return normalized;
}

function blobTokenOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? { token } : {};
}

function blobSigningErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Vercel Blob signing error.";

  if (
    message.includes("No blob credentials found") ||
    message.includes("No read-write token found")
  ) {
    return "Missing Vercel Blob credentials. Connect the Blob store to this Vercel environment, or set BLOB_READ_WRITE_TOKEN.";
  }

  if (message.includes("no storeId was found")) {
    return "Missing BLOB_STORE_ID for Vercel Blob OIDC signing. Connect the Blob store to this Vercel environment or set BLOB_STORE_ID.";
  }

  if (message.includes("Blob path does not match")) {
    return "Saved Blob pathname does not match the signing scope. Re-upload the file, or verify the stored pathname.";
  }

  if (message.includes("HMAC is not available")) {
    return "Vercel Blob signing needs Node 20+ crypto support. Set the deployment runtime to Node.js 20 or newer.";
  }

  return "Vercel Blob rejected the signing request. Check the function logs for the detailed Blob error.";
}

export async function GET(request: NextRequest) {
  const authResponse = verifyAdminAccess(request);

  if (authResponse) {
    return authResponse;
  }

  const pathname = normalizePathname(
    request.nextUrl.searchParams.get("pathname"),
  );

  if (!pathname) {
    return forbidden("Missing or invalid intake Blob pathname.", 400);
  }

  try {
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
      ...blobTokenOptions(),
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: "private",
      operation: "get",
      pathname,
      validUntil,
    });
    const response = NextResponse.redirect(presignedUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const message = blobSigningErrorMessage(error);
    console.error("Failed to sign private intake Blob download", {
      pathname,
      message,
      error,
    });
    return forbidden(message, 502);
  }
}
