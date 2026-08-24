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
      {
        src: `${base}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
