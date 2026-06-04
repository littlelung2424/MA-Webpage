import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./index.html"],
    "/[...path]": [
      "./02.png",
      "./MA_wavingmascot-hat.png",
      "./MissionAtlasXD_Mascot_02.png",
      "./apple-touch-icon.png",
      "./apps/index.html",
      "./favicon-16x16.png",
      "./favicon-180x180.png",
      "./favicon-32x32.png",
      "./favicon-48x48.png",
      "./favicon-512x512.png",
      "./favicon.ico",
      "./robots.txt",
      "./site.webmanifest",
      "./sitemap.xml",
    ],
  },
};

export default nextConfig;
