// middleware.js: the caching headers of every response the Next.js app sends through the CDN.
// The browser reads Cache-Control. The CDN reads CDN-Cache-Control when present (RFC 9213, supported by
// Vercel, Cloudflare and Fastly), otherwise Cache-Control (s-maxage before max-age).
//
// path:   the request path, e.g. "/_next/static/chunks/app-3f9a1c.js", "/api/restaurants/42/menu"
// return: { "Cache-Control": "...", "CDN-Cache-Control"?: "..." }
function cachingHeaders(path) {
    // [ ] Build files whose name changes with their content
    // [ ] Menus: shared, a minute fresh, refreshed in the background
    // [ ] The customer's own cart
    // [ ] Pages: checked on every visit, cheap when unchanged
    return { "Cache-Control": "no-store" };
}
