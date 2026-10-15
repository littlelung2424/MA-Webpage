import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./static-pages/index.html"],
    "/workspace/order-verification": ["./static-pages/workspace/order-verification/index.html"],
    "/workspace/four-c-qa-scorer": ["./static-pages/workspace/four-c-qa-scorer/index.html"],
    "/workspace": ["./static-pages/workspace/index.html"],
    "/[...path]": ["./static-pages/index.html"],
  },
};

export default nextConfig;
