import type { NextConfig } from "next";

// Workspace packages ship TypeScript source, so Next transpiles them.
// Hosted: NEXT_PUBLIC_SERVER_URL="/" and SUPABRAIN_API_ORIGIN=<the API server's origin>. The website then proxies the
// API on its own domain, so the owner's sign-in cookie is first-party (browsers drop third-party cookies).
const api = process.env.SUPABRAIN_API_ORIGIN?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@supabrain/shared"],
  async rewrites() {
    if (!api) return [];
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/healthz", destination: `${api}/healthz` },
    ];
  },
};

export default nextConfig;
