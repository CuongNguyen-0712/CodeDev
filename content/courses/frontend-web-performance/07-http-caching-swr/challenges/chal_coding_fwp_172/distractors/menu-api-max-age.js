// @piece menu-api: Menus: shared, a minute fresh, refreshed in the background
if (/^\/api\/restaurants\/[^/]+\/menu$/.test(path)) return { "Cache-Control": "public, max-age=300" };
