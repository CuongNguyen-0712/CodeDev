// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-3-2",
    title: "Static files, caching and rate limits in Nginx",
    slug: { _type: "slug", current: "nginx-static-files-caching-rate-limits" },
    description:
        "Rice Rocket's web app shows a blank page after every deploy, deep links are 404s, and a credential-stuffing burst sent 2,000 login attempts a minute to the api. Learn try_files and the SPA fallback, cache headers for hashed bundles and the HTML shell, the add_header inheritance trap, gzip_types, and limit_req with burst and nodelay, then fix default.conf.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "nginx serves the Vite build of the web app from /usr/share/nginx/html and proxies /api/ to the api. After each deploy, support gets \"the app is a white screen\" tickets until users clear their cache; links shared in chat like /orders/42 open a 404; and on Saturday night one botnet tried 2,000 passwords a minute against /api/login, all of which reached the api and the database.",
    },

    content: [
        h2("Situation"),
        p("The static part of default.conf was written in five minutes. It serves files, and that is all it does well:"),
        code("nginx", `
server {
    root /usr/share/nginx/html;
    gzip on;
    expires 1d;
    add_header X-Content-Type-Options nosniff;

    location / {
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://api/;
    }
}`, "nginx/conf.d/default.conf"),
        p("Vite writes `index.html` plus bundles with a content hash in the name, `assets/index-4f9a2c.js`. A deploy replaces the hashed files, but `expires 1d` lets browsers keep yesterday's index.html for a day, and it asks for `index-9d01ab.js`, which no longer exists. `try_files $uri =404` knows nothing about client-side routes, and nothing stands between `/api/login` and a botnet."),

        h2("The core you need"),
        bullets([
            "**try_files checks files in order, then falls back.** `try_files $uri $uri/ /index.html;` serves the file, else the directory's index, else makes an **internal redirect** to `/index.html`. The browser gets 200 and keeps its URL, so the app's router renders `/orders/42`. A last parameter `=404` answers 404 instead.",
            "**Cache what has a hash, revalidate what does not.** A hashed file never changes content, so `expires 1y;` (Cache-Control: max-age=31536000) is safe. `index.html` points at the current hashes: `expires -1;` sends Cache-Control: no-cache, so the browser revalidates every load (a cheap 304 when nothing changed).",
            "**expires and add_header only touch successful responses.** 200, 201, 204, 206, 301-304, 307 and 308 get them; a 404 or 429 does not, unless add_header has the `always` parameter.",
            "**add_header is all-or-nothing per level.** A location inherits the server's `add_header` lines only if it has none of its own. `add_header Cache-Control ...` in `/assets/` silently drops the server's `X-Content-Type-Options` there. `expires` is a different directive and does not trigger this.",
            "**gzip only compresses listed types.** `gzip on;` alone compresses text/html only. Add `gzip_types` for CSS, JavaScript, JSON and SVG; skip PNG, JPEG and WOFF2, which are already compressed.",
            "**limit_req is a leaky bucket per key.** `limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;` gives each client IP 10 requests a minute (one every 6 s). `burst=5` lets 5 extra requests queue; `nodelay` serves those at once instead of spacing them out. Anything beyond the burst is rejected with `limit_req_status`, 503 unless you set 429.",
        ]),

        h2("Apply it in the project"),
        p("The Vite build lands in the nginx container read-only; the file names change on every release:"),
        code("text", `
/usr/share/nginx/html/
  index.html
  favicon.ico
  robots.txt
  assets/index-4f9a2c.js
  assets/index-b81e07.css
  assets/logo-9c1d2e.svg
  assets/hero-77aa01.png`, "web/dist (mounted)"),
        p("Give each kind of file its own location, and put the login limit on exactly one endpoint:"),
        code("nginx", `
upstream api {
    server api:3000;
}

# http level: 10 login attempts a minute per client IP; 10 MB holds about 160,000 IPs.
limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;

server {
    listen 80;
    server_name ricerocket.vn;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript text/javascript application/json image/svg+xml;
    add_header X-Content-Type-Options nosniff;
    # (proxy_set_header lines from the previous lesson stay here)

    location / {
        try_files $uri $uri/ /index.html;    # /orders/42 -> the app shell, URL unchanged
    }

    location = /index.html {
        expires -1;                          # Cache-Control: no-cache, nosniff still inherited
    }

    location /assets/ {
        try_files $uri =404;                 # a missing bundle is a 404, never HTML
        expires 1y;
    }

    location /api/ {
        proxy_pass http://api/;
    }

    location = /api/login {
        limit_req zone=login burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://api/login;
    }
}`, "nginx/conf.d/default.conf"),
        p("`/` and the fallback both end up in `location = /index.html`: the index file and the try_files fallback are internal redirects, and every internal redirect picks a location again. That is why the shell gets no-cache however it was reached."),
        callout("info", "application/javascript or text/javascript?",
            "Which type nginx gives .js comes from the mime.types file shipped with your version. Listing both in gzip_types costs nothing; check the result with curl -sI and the Content-Type line."),

        h2("Verify"),
        code("bash", `
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
curl -sI https://ricerocket.vn/ | grep -i -E "^(HTTP|cache-control)"
# HTTP/1.1 200 OK / Cache-Control: no-cache
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" https://ricerocket.vn/assets/index-4f9a2c.js | grep -i -E "cache-control|content-encoding|nosniff"
# Cache-Control: max-age=31536000 / Content-Encoding: gzip / X-Content-Type-Options: nosniff
curl -s -o /dev/null -w "%{http_code}\\n" https://ricerocket.vn/orders/42             # 200
curl -s -o /dev/null -w "%{http_code}\\n" https://ricerocket.vn/assets/index-0ld000.js # 404
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -X POST https://ricerocket.vn/api/login; done
# 401 401 401 401 401 401 429 429 429 429 429 429
# (the first 6 reach the api, which rejects the empty body; nginx answers the rest itself)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A cache header in a location drops the security headers.** Detect it with `curl -sI` on one file per location; fix it with `expires` instead of `add_header Cache-Control`, or repeat the headers in that location.",
            "**SPA fallback in `/assets/`.** `try_files $uri /index.html` there answers a deleted bundle with HTML and status 200; the browser refuses it as JavaScript and the page stays blank. Hashed paths must 404.",
            "**Limiting by IP behind another proxy.** `$binary_remote_addr` is the address that connected to nginx. Here nginx is the edge, so that is the client. Put a CDN or load balancer in front and every user shares a few IPs: then set the real client IP first (`set_real_ip_from` and `real_ip_header`).",
        ]),

        challenge("chal_quiz_dkn_171"),
        p("Now fix the real file. The editor starts from the finished default.conf with its key blocks missing; fill each `[ ]` line by clicking a piece, or drag it onto the line on desktop. Some pieces repeat the pitfalls above. Run answers each request with a simulator of the rules above and reports the status, the file served, the Cache-Control class, gzip, the rate limit and nosniff."),
        challenge("chal_coding_dkn_172"),
    ],
});
