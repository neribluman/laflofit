import type { NextConfig } from "next";

/**
 * Set BASE_PATH=/laflofit to serve the app from a sub-path of a domain that
 * already has something else on it. Leave it unset to serve from the root.
 *
 * It has to be a build-time value — Next bakes it into every generated URL —
 * so it lives here rather than being read at runtime.
 */
const basePath = process.env.BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  basePath,
  env: {
    // Mirrored so server code (the session cookie) can scope itself to match.
    NEXT_PUBLIC_BASE_PATH: basePath ?? "",
  },
};

export default nextConfig;
