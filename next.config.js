/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/home/:name',
                destination: '/home?name=:name',
            },
        ]
    },
}

module.exports = nextConfig