import { staticHtmlResponse } from "../../lib/staticHtml";

const COMPATIBILITY_PAGES: Record<string, string> = {
  "index.html": "static-pages/index.html",
  "tools/index.html": "static-pages/tools/index.html",
};

const LEGACY_ASSET_REDIRECTS: Record<string, string> = {
  "02.png": "/assets/brand/02.png",
  "05.png": "/assets/brand/05.png",
  "MA_wavingmascot-hat.png": "/assets/mascots/MA_wavingmascot-hat.png",
  "MissionAtlasXD_Mascot.png": "/assets/mascots/MissionAtlasXD_Mascot.png",
  "MissionAtlasXD_Mascot_02.png": "/assets/mascots/MissionAtlasXD_Mascot_02.png",
  "apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "favicon-16x16.png": "/icons/favicon-16x16.png",
  "favicon-180x180.png": "/icons/favicon-180x180.png",
  "favicon-32x32.png": "/icons/favicon-32x32.png",
  "favicon-48x48.png": "/icons/favicon-48x48.png",
  "favicon-512x512.png": "/icons/favicon-512x512.png",
  "favicon.ico": "/icons/favicon.ico",
};

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { path: pathSegments } = await context.params;
  const requestedPath = pathSegments.join("/");
  const legacyAssetRedirect = LEGACY_ASSET_REDIRECTS[requestedPath];

  if (legacyAssetRedirect) {
    return Response.redirect(new URL(legacyAssetRedirect, request.url), 308);
  }

  const filePath = COMPATIBILITY_PAGES[requestedPath];

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  return staticHtmlResponse(filePath);
}
