import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    // Baseline browser defense-in-depth only (GAP-5): clickjacking, MIME
    // sniffing, referrer leakage, and framing/object embedding. Deliberately
    // no default-src/script-src, nonce, or HSTS so Next.js inline
    // scripts/styles and the Supabase browser SDK keep working, and nothing
    // changes for proxy/session cache headers or cookie chunks.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

