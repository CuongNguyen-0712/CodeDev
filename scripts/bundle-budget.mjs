// JS budget per public route: sums the script chunks a page's HTML references (what the browser
// must load before the page is interactive; prefetches are not counted) and fails when a route is
// over its budget. Run against a production build: `npm run build && npm start`, then
//   npm run budget                      (http://localhost:3000)
//   npm run budget -- http://host:port
// Budgets are uncompressed KB, set about 5% above the figures in
// docs/ui-ux/CLIENT_RENDER_AND_UX_PLAN.md §7 (2026-11-03).
const BUDGET_KB = {
    "/": 1160,
    "/course": 1160,
    "/course/system-design-capstone": 1180,
    "/roadmap": 1130,
    "/blog": 1080,
    "/auth": 1170,
};

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
let failed = false;

for (const [route, budget] of Object.entries(BUDGET_KB)) {
    const res = await fetch(base + route);
    if (!res.ok) {
        console.log(`${route}: HTTP ${res.status}`);
        failed = true;
        continue;
    }
    const html = await res.text();
    const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[^"'\s]+?\.js/g) || [])];
    let bytes = 0;
    for (const chunk of chunks) bytes += (await (await fetch(base + chunk)).arrayBuffer()).byteLength;
    const kb = Math.round(bytes / 1024);
    const over = kb > budget;
    failed ||= over;
    console.log(`${over ? "OVER" : "ok  "} ${route}: ${kb} KB / ${budget} KB (${chunks.length} files)`);
}

process.exit(failed ? 1 : 0);
