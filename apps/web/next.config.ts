import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  async headers() {
    return [{ source: "/images/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
  transpilePackages: ["@platform/website-engine", "@platform/business-finder", "@platform/site-data", "@platform/core"],
};
export default nextConfig;
