import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // Yarn v1 hoists Next.js to the monorepo root on Novonode.
    // Explicitly include that root so Turbopack can resolve next/package.json
    // and the shared BOM workspaces during production builds.
    root: path.resolve(process.cwd(), "../.."),
  },
};

export default nextConfig;
