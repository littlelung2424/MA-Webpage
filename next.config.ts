import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./static-pages/index.html"],
    "/tools": ["./static-pages/tools/index.html"],
    "/[...path]": ["./static-pages/index.html", "./static-pages/tools/index.html"],
  },
};

export default nextConfig;
