const { mediaOrigins } = require('./lib/media/mediaOrigins.mjs');

// Local Payload serves lesson/avatar/cover files outside production (never in production builds).
// Taken from mediaOrigins(), which already drops an unparseable PAYLOAD_URL.
const [, payloadOrigin = null] = mediaOrigins(process.env).map((origin) => new URL(origin));

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Standalone server is for the Docker image only; Vercel packages its own functions.
    output: process.env.VERCEL ? undefined : 'standalone',
    reactStrictMode: false,
    // Cache Components (Partial Prerendering): static shell + cached data ('use cache') + runtime
    // data streamed behind <Suspense>. See docs/rendering-strategy-plan.md.
    cacheComponents: true,
    // <Link> prefetches each route's App Shell once; `prefetch` on a link also fetches that URL's
    // cached content (course cards).
    partialPrefetching: true,
    experimental: {
        // Avatar uploads go through a server action; the service enforces the real 5 MB limit
        // (the default 1 MB would reject larger photos before validation runs).
        serverActions: { bodySizeLimit: '6mb' },
    },
    // Renderer allowlist for lesson media (see lib/media/mediaOrigins.mjs).
    env: { NEXT_PUBLIC_MEDIA_ORIGINS: mediaOrigins(process.env).join(',') },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'res.cloudinary.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: "https",
                hostname: "avatars.githubusercontent.com",
                port: "",
                pathname: "/**"
            },
            {
                protocol: "https",
                hostname: "lh3.googleusercontent.com",
                port: "",
                pathname: "/**"
            },
            ...(payloadOrigin ? [{
                protocol: payloadOrigin.protocol.replace(':', ''),
                hostname: payloadOrigin.hostname,
                port: payloadOrigin.port,
                pathname: '/api/media/file/**',
            }] : []),
        ],
        deviceSizes: [320, 480, 768, 1024, 1280, 1600, 1920],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        minimumCacheTTL: 60,
        qualities: [100, 75],
    },
    // Admin area and studio: never indexed, cached, framed or sent as a referrer.
    async headers() {
        const headers = [
            { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
            { key: 'Cache-Control', value: 'private, no-store' },
            { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
            { key: 'Referrer-Policy', value: 'no-referrer' },
        ];
        return [
            { source: '/admin', headers },
            { source: '/admin/:path*', headers },
            { source: '/studio/:path*', headers },
        ];
    },
};

module.exports = nextConfig;
