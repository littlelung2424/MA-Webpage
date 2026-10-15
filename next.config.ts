import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./static-pages/index.html"],
    "/tools/order-verification": ["./static-pages/tools/order-verification/index.html"],
    "/tools/four-c-qa-scorer": ["./static-pages/tools/four-c-qa-scorer/index.html"],
    "/tools": ["./static-pages/tools/index.html", "./static-pages/workspace/index.html"],
    "/workspace": ["./static-pages/workspace/index.html"],
    "/[...path]": ["./static-pages/index.html", "./static-pages/tools/index.html"],
  },
};

export default nextConfig;
