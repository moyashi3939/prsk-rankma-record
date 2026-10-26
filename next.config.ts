import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.10.16', '10.208.36.146'],
  experimental: {
    agentFeedback: true,
  },
  // cacheComponents: true,     // ← 両方ともコメントアウトまたは削除
  // partialPrefetching: true,  // ← 両方ともコメントアウトまたは削除
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;