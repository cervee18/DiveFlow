import type { NextConfig } from "next";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const IS_LOCAL      = SUPABASE_URL.includes("127.0.0.1");
const SUPABASE_HOST = IS_LOCAL
  ? "127.0.0.1:54321"
  : (SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "jsqjbnamfnwiesqkcmdp.supabase.co");

const securityHeaders = [
  // ── Clickjacking ──────────────────────────────────────────────────────────
  // Prevents the app from being embedded in an <iframe> on another origin.
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },

  // ── MIME sniffing ─────────────────────────────────────────────────────────
  // Tells the browser to honour the declared Content-Type and not guess.
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },

  // ── Referrer ──────────────────────────────────────────────────────────────
  // Sends the full URL on same-origin requests; only the origin on cross-origin.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },

  // ── HSTS ─────────────────────────────────────────────────────────────────
  // Forces HTTPS for 1 year. includeSubDomains covers any sub-paths.
  // Remove / shorten max-age during initial rollout if needed.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },

  // ── Permissions ───────────────────────────────────────────────────────────
  // Deny browser APIs the app doesn't need.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
    ].join(", "),
  },

  // ── Content Security Policy ───────────────────────────────────────────────
  // Limits where scripts, styles, and network connections can originate.
  //
  // Notes:
  //   • 'unsafe-inline' on script-src / style-src is required by Next.js App
  //     Router (inline scripts for hydration) and Tailwind CSS (inline styles).
  //     Use nonces (next.config headers + middleware) to tighten this further.
  //   • connect-src includes both HTTPS and WSS for Supabase Realtime.
  //   • img-src includes data: for base64 thumbnails and blob: for file previews.
  {
    key: "Content-Security-Policy",
    value: [
      `default-src 'self'`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,   // unsafe-eval needed by Next.js dev & some prod builds
      `style-src 'self' 'unsafe-inline'`,                  // Tailwind inline styles
      IS_LOCAL
        ? `img-src 'self' data: blob: http://127.0.0.1:54321 https://${SUPABASE_HOST}`
        : `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
      `font-src 'self'`,
      IS_LOCAL
        ? `connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`
        : `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
      `frame-ancestors 'none'`,                             // stronger than X-Frame-Options
      `base-uri 'self'`,                                    // prevents base-tag hijacking
      `form-action 'self'`,                                 // forms only submit to same origin
      `object-src 'none'`,                                  // no Flash / plugins
      `upgrade-insecure-requests`,                          // force HTTP→HTTPS on mixed content
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
