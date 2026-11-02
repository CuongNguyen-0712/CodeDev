import { THEME_SCRIPT } from "@/lib/themeScript";

/**
 * Script policy for /admin pages (docs/admin-panel-plan.md 10.2, S16), set by proxy.js on the request
 * (Next.js reads the nonce from it and puts it on its own scripts) and on the response.
 * The root layout's inline theme script is allowed by its hash, so the root layout stays static.
 * frame-ancestors stays in next.config.js headers (report-only policies cannot carry it).
 */
// shortcut: report-only until a signed-in admin page shows no CSP reports in the console; then switch to
// Content-Security-Policy and merge next.config.js's frame-ancestors into this one.
export const ADMIN_CSP_HEADER = "Content-Security-Policy-Report-Only";

const sha256 = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
};

let themeHash = null;

export const isAdminPage = (pathname) => pathname === "/admin" || pathname.startsWith("/admin/");

/** @returns {Promise<{ nonce: string, value: string }>} a fresh nonce per request */
export async function adminCsp({ dev = process.env.NODE_ENV !== "production" } = {}) {
    themeHash ??= await sha256(THEME_SCRIPT);
    const nonce = btoa(crypto.randomUUID());
    const scripts = `script-src 'self' 'nonce-${nonce}' 'sha256-${themeHash}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`;
    return { nonce, value: [scripts, "object-src 'none'", "base-uri 'none'"].join("; ") };
}
