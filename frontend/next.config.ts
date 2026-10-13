import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: "/jit",
        destination: "/admin/jit-elevation",
        permanent: false,
      },
      {
        source: "/commercial",
        destination: "/pricing",
        permanent: false,
      },
      {
        source: "/observability",
        destination: "/admin/platform-health",
        permanent: false,
      },
      {
        source: "/admin/g1-launch-gate",
        destination: "/admin/g1-gate",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
