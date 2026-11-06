// middleware.js: the caching headers of every response the Next.js app sends through the CDN.
// The browser reads Cache-Control. The CDN reads CDN-Cache-Control when present (RFC 9213, supported by
// Vercel, Cloudflare and Fastly), otherwise Cache-Control (s-maxage before max-age).
//
// path:   the request path, e.g. "/_next/static/chunks/app-3f9a1c.js", "/api/restaurants/42/menu"
// return: { "Cache-Control": "...", "CDN-Cache-Control"?: "..." }
function cachingHeaders(path) {
    // @piece hashed-assets: Build files whose name changes with their content
    if (path.startsWith("/_next/static/")) return { "Cache-Control": "public, max-age=31536000, immutable" };
    // @end
    // @piece menu-api: Menus: shared, a minute fresh, refreshed in the background
    if (/^\/api\/restaurants\/[^/]+\/menu$/.test(path)) {
        return { "Cache-Control": "no-cache", "CDN-Cache-Control": "max-age=60, stale-while-revalidate=300" };
    }
    // @end
    // @piece cart-api: The customer's own cart
    if (path === "/api/cart") return { "Cache-Control": "private, no-store" };
    // @end
    // @piece html-pages: Pages: checked on every visit, cheap when unchanged
    if (path.startsWith("/restaurants/")) return { "Cache-Control": "no-cache" };
    // @end
    return { "Cache-Control": "no-store" };
}
