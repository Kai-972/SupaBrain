import type { NextConfig } from "next";

// Lane C owns apps/web. Workspace packages ship TypeScript source, so Next transpiles them.
const nextConfig: NextConfig = {
  transpilePackages: ["@supabrain/shared"],
};

export default nextConfig;
