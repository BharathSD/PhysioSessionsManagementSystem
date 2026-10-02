import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home Screen") on Android, iOS and desktop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Physio Sessions",
    short_name: "Physio",
    description: "Track physiotherapy sessions, attendance and payments.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
