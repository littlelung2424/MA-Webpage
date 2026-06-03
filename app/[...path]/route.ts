import { readFile } from "node:fs/promises";
import path from "node:path";

const LEGACY_ASSET_CONTENT_TYPES: Record<string, string> = {
  "02.png": "image/png",
  "05.png": "image/png",
  "MA_wavingmascot-hat.png": "image/png",
  "MissionAtlasXD_Mascot.png": "image/png",
  "apple-touch-icon.png": "image/png",
  "favicon-16x16.png": "image/png",
  "favicon-180x180.png": "image/png",
  "favicon-32x32.png": "image/png",
  "favicon-48x48.png": "image/png",
  "favicon-512x512.png": "image/png",
  "favicon.ico": "image/x-icon",
  "robots.txt": "text/plain; charset=utf-8",
  "site.webmanifest": "application/manifest+json; charset=utf-8",
  "sitemap.xml": "application/xml; charset=utf-8",
  "apps": "text/html; charset=utf-8",
  "apps/index.html": "text/html; charset=utf-8",
};

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { path: pathSegments } = await context.params;
  const requestedPath = pathSegments.join("/");
  const contentType = LEGACY_ASSET_CONTENT_TYPES[requestedPath];

  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = requestedPath === "apps" ? "apps/index.html" : requestedPath;
  const file = await readFile(path.join(process.cwd(), filePath));

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
    },
  });
}
