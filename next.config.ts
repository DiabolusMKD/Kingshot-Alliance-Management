import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed 'output: export' to support dynamic API routes
  images: {
    unoptimized: true,
  },
  // Proxy Supabase through our own origin so browser requests are same-origin
  // and never hit a CORS preflight (some browsers/extensions block PATCH preflights)
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL is not set. Copy your Supabase credentials into .env.local (see SETUP_GUIDE.md)."
      );
    }
    return [
      {
        source: "/supabase/:path*",
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
