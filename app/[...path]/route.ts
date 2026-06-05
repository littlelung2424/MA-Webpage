import { readFile } from "node:fs/promises";
import path from "node:path";

type LegacyAsset = {
  filePath: string;
  contentType: string;
};

const LEGACY_ASSETS: Record<string, LegacyAsset> = {
  "02.png": { filePath: "02.png", contentType: "image/png" },
  "05.png": { filePath: "05.png", contentType: "image/png" },
  "MA_wavingmascot-hat.png": {
    filePath: "MA_wavingmascot-hat.png",
    contentType: "image/png",
  },
  "MissionAtlasXD_Mascot.png": {
    filePath: "MissionAtlasXD_Mascot.png",
    contentType: "image/png",
  },
  "MissionAtlasXD_Mascot_02.png": {
    filePath: "MissionAtlasXD_Mascot_02.png",
    contentType: "image/png",
  },
  "apple-touch-icon.png": {
    filePath: "apple-touch-icon.png",
    contentType: "image/png",
  },
  "favicon-16x16.png": {
    filePath: "favicon-16x16.png",
    contentType: "image/png",
  },
  "favicon-180x180.png": {
    filePath: "favicon-180x180.png",
    contentType: "image/png",
  },
  "favicon-32x32.png": {
    filePath: "favicon-32x32.png",
    contentType: "image/png",
  },
  "favicon-48x48.png": {
    filePath: "favicon-48x48.png",
    contentType: "image/png",
  },
  "favicon-512x512.png": {
    filePath: "favicon-512x512.png",
    contentType: "image/png",
  },
  "favicon.ico": { filePath: "favicon.ico", contentType: "image/x-icon" },
  "robots.txt": {
    filePath: "robots.txt",
    contentType: "text/plain; charset=utf-8",
  },
  "site.webmanifest": {
    filePath: "site.webmanifest",
    contentType: "application/manifest+json; charset=utf-8",
  },
  "sitemap.xml": {
    filePath: "sitemap.xml",
    contentType: "application/xml; charset=utf-8",
  },
  tools: { filePath: "tools/index.html", contentType: "text/html; charset=utf-8" },
  "tools/index.html": {
    filePath: "tools/index.html",
    contentType: "text/html; charset=utf-8",
  },
};

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { path: pathSegments } = await context.params;
  const requestedPath = pathSegments.join("/");
  const asset = LEGACY_ASSETS[requestedPath];

  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  const file = await readFile(
    path.join(/* turbopackIgnore: true */ process.cwd(), asset.filePath),
  );

  return new Response(file, {
    headers: {
      "Content-Type": asset.contentType,
    },
  });
}
