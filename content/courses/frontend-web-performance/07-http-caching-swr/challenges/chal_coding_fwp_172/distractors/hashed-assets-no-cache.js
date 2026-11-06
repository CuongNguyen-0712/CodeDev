// @piece hashed-assets: Build files whose name changes with their content
if (path.startsWith("/_next/static/")) return { "Cache-Control": "public, no-cache" };
