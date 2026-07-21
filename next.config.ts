import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com" }],
  },
  // Bundle the data files (seed JSON + scrubbed DB snapshot) into serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./data/founders.json", "./data/deploy-snapshot.db"],
  },
};

export default nextConfig;
