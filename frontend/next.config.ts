import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Production: static export to out/, served by FastAPI on the same origin.
// Dev (`npm run dev`): proxy /api/* to the backend on :8000 (rewrites are not
// allowed together with `output: 'export'`, so they are added in dev only).
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
      },
    };
  }
  return {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: false,
  };
}
