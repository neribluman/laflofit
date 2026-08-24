import type { MetadataRoute } from "next";

// Built rather than static, so the paths follow BASE_PATH when the app is
// served from a sub-path.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LaFloFit",
    short_name: "LaFloFit",
    start_url: `${base}/crew`,
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      { src: `${base}/logo-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/logo-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
