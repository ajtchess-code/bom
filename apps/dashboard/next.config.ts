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
  // Retired sections: send old bookmarks home instead of a 404.
  async redirects() {
    return ["/dashboard/minecraft", "/dashboard/clash"].flatMap((source) => [
      { source, destination: "/dashboard", permanent: false },
      { source: `${source}/:path*`, destination: "/dashboard", permanent: false },
    ]);
  },
};

export default nextConfig;
