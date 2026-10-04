import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only badge; bottom-left (the default) covers the app's bottom nav.
  devIndicators: { position: "top-right" },
  experimental: {
    // Patchy mobile signal: a save or page load that fails on the network waits
    // and goes through once the signal is back, instead of erroring.
    useOffline: true,
  },
  async headers() {
    return [
      {
        // Always fetch the newest service worker, and let it run only our own code.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
