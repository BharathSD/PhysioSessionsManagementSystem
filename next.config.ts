import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only badge; bottom-left (the default) covers the app's bottom nav.
  devIndicators: { position: "top-right" },
};

export default nextConfig;
