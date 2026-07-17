import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Standalone output for Docker deployment ──
  output: "standalone",

  // ── External packages (not bundled by Next.js) ──
  serverExternalPackages: ['nodemailer', 'pdf-lib', 'qrcode', 'archiver', 'sharp', 'pdfkit'],

  // ── TypeScript (skip errors in production builds) ──
  typescript: {
    ignoreBuildErrors: true,
  },

  // ── React settings ──
  reactStrictMode: false,

  // ── Image optimization ──
  images: {
    formats: ['image/webp', 'image/avif'],
    qualities: [75, 90],
    // Allow external image domains if needed
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // ── Headers for security ──
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
