import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_DEMO_FALLBACK: "true",
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
      {
        source: "/evidence",
        destination: "/ledger",
        permanent: false,
      },
      {
        source: "/audit-packages",
        destination: "/audit",
        permanent: false,
      },
      {
        source: "/war-room",
        destination: "/cases/incidents/command",
        permanent: false,
      },
      {
        source: "/command",
        destination: "/cases/incidents/command",
        permanent: false,
      },
      {
        source: "/health",
        destination: "/admin/platform-health",
        permanent: false,
      },
      {
        source: "/gtm",
        destination: "/admin/gtm-checklist",
        permanent: false,
      },
      {
        source: "/g1-gate",
        destination: "/admin/g1-gate",
        permanent: false,
      },
      {
        source: "/email-templates",
        destination: "/admin/email-templates",
        permanent: false,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.output = {
        ...config.output,
        chunkLoadTimeout: 300000, // 300s to prevent chunk load timeout on cold dev server builds
      };
    }
    return config;
  },
};

export default nextConfig;
