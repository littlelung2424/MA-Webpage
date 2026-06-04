import { readFile } from "node:fs/promises";
import path from "node:path";

type LegacyAsset = {
  contentType: string;
  filePath: string;
};

const LEGACY_ASSETS: Record<string, LegacyAsset> = {
  "02.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "02.png"),
  },
  "MA_wavingmascot-hat.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "MA_wavingmascot-hat.png"),
  },
  "MissionAtlasXD_Mascot_02.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "MissionAtlasXD_Mascot_02.png"),
  },
  "apple-touch-icon.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "apple-touch-icon.png"),
  },
  "favicon-16x16.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "favicon-16x16.png"),
  },
  "favicon-180x180.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "favicon-180x180.png"),
  },
  "favicon-32x32.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "favicon-32x32.png"),
  },
  "favicon-48x48.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "favicon-48x48.png"),
  },
  "favicon-512x512.png": {
    contentType: "image/png",
    filePath: path.join(process.cwd(), "favicon-512x512.png"),
  },
  "favicon.ico": {
    contentType: "image/x-icon",
    filePath: path.join(process.cwd(), "favicon.ico"),
  },
  "robots.txt": {
    contentType: "text/plain; charset=utf-8",
    filePath: path.join(process.cwd(), "robots.txt"),
  },
  "site.webmanifest": {
    contentType: "application/manifest+json; charset=utf-8",
    filePath: path.join(process.cwd(), "site.webmanifest"),
  },
  "sitemap.xml": {
    contentType: "application/xml; charset=utf-8",
    filePath: path.join(process.cwd(), "sitemap.xml"),
  },
  apps: {
    contentType: "text/html; charset=utf-8",
    filePath: path.join(process.cwd(), "apps/index.html"),
  },
  "apps/index.html": {
    contentType: "text/html; charset=utf-8",
    filePath: path.join(process.cwd(), "apps/index.html"),
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

  const file = await readFile(asset.filePath);

  return new Response(file, {
    headers: {
      "Content-Type": asset.contentType,
    },
  });
}
