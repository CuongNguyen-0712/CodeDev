/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/',
                destination: '/homepage',
            },
        ]
    },
    reactStrictMode: false,
}

module.exports = nextConfig