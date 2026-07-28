import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The R3F/postprocessing arcade scene doesn't survive StrictMode's dev-only
  // double-mount (WebGL context churn crashes the EffectComposer).
  reactStrictMode: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com" }],
  },
  // Bundle the data files (seed JSON + scrubbed DB snapshot) into serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./data/founders.json", "./data/deploy-snapshot.db"],
  },
  async redirects() {
    // the classic site moved under /v1 when the arcade took over the root
    return [
      { source: "/company/:slug", destination: "/v1/company/:slug", permanent: false },
    ];
  },
};

export default nextConfig;
