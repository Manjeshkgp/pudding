import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep an optional build check separate from a running development server.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  logging: {
    incomingRequests: {
      ignore: [
        /\/api\/auth\/paypal\/callback/,
        /\/api\/auth\/paypal\/vault\/return/,
        /\/onboarding\/plan/,
        /\/api\/family\/co-parents\/accept/,
        /\/accept-invite/,
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
