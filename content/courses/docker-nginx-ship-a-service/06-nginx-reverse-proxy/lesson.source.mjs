// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-3-1",
    title: "Nginx as a reverse proxy: upstreams, headers, timeouts",
    slug: { _type: "slug", current: "nginx-reverse-proxy-upstreams-headers-timeouts" },
    description:
        "Rice Rocket put nginx in front of the api and four things broke at once: every client is 172.18.0.5, /api/orders is a 404, redirects go to http:// and report exports die after 60 s. Learn how nginx picks a location, rewrites the path in proxy_pass, forwards client information and times out, then fix the site's default.conf.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "nginx now terminates HTTPS on the VPS, serves the web app and proxies /api/ to the api container. Since the switch, the login rate limiter blocks whole offices (every client is 172.18.0.5), the app gets 404 on /api/orders, password-reset links start with http://, and the monthly report export fails with 504 after exactly 60 seconds.",
    },

    content: [
        h2("Situation"),
        p("This is the default.conf that went live. nginx accepts the traffic and the web app loads, but every api call is subtly wrong:"),
        code("nginx", `
server {
    listen 80;
    listen 443 ssl;
    server_name ricerocket.vn;
    root /usr/share/nginx/html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api:3000;
    }
}`, "nginx/conf.d/default.conf"),
        code("text", `
api  | GET /api/orders 404 ip=172.18.0.5 proto=http host=api:3000
api  | POST /login 302 Location: http://ricerocket.vn/account ip=172.18.0.5
nginx| upstream timed out (110: Connection timed out) while reading response header from upstream ... "GET /api/reports/monthly?month=2026-10"`, "docker compose logs"),
        p("The api is fine. From its side, every request comes from nginx's container IP, over plain http, to host `api:3000`, with an `/api` prefix it never defined. Each symptom maps to one proxy rule."),

        h2("The core you need"),
        bullets([
            "**How nginx picks a location.** An `=` exact match wins outright. Otherwise the longest matching prefix is remembered; if it is marked `^~` it is used, else the regex locations (`~`, `~*`) are tried in file order and the first match wins, and only if none matches is the longest prefix used. `/api/reports/x` therefore lands in `location /api/reports/`, not in `location /api/`.",
            "**proxy_pass rewrites the path only if it has a URI part.** `proxy_pass http://api:3000;` (nothing after the port) passes the request URI unchanged: `/api/orders`. `proxy_pass http://api/;` replaces the part that matched the location (`/api/`) with `/`: the api receives `/orders`, query string kept.",
            "**An upstream block names the backend once.** `upstream api { server api:3000; }` lets every location say `proxy_pass http://api/;`. With an upstream defined, `proxy_pass http://api:3000/` is a config error: the port belongs in the upstream.",
            "**The api only knows what nginx tells it.** By default nginx sends `Host: $proxy_host` (here `api` or `api:3000`) and nothing about the client. `X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto $scheme` and `Host $host` carry the client IP, the scheme and the public host name.",
            "**proxy_set_header is all-or-nothing per level.** A location inherits the outer `proxy_set_header` lines only if it has none of its own. One extra header in a location silently drops all the others there.",
            "**Timeouts are per read, default 60 s.** `proxy_read_timeout` is the longest gap between two reads from the api, not the total response time. A report that sends nothing for 4 minutes needs a larger value, and only in its own location.",
        ]),

        h2("Apply it in the project"),
        p("nginx runs in the same Compose project as the api, so it reaches the api by its service name. The config lives next to the compose file and is mounted read-only:"),
        code("text", `
deploy/
  compose.yaml           -> services: nginx, api, db
  nginx/conf.d/default.conf
  nginx/certs/           (fullchain.pem, privkey.pem)
web/dist/                -> mounted at /usr/share/nginx/html`, "tree"),
        p("Rewrite default.conf: name the api once, set the forwarded headers at server level so every location inherits them, strip the prefix, and give exports their own timeout:"),
        code("nginx", `
upstream api {
    server api:3000;
}

server {
    listen 80;
    listen 443 ssl;
    server_name ricerocket.vn;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    root /usr/share/nginx/html;

    # Server level: inherited by every location that sets no proxy_set_header itself.
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api/;            # /api/orders -> /orders
    }

    location /api/reports/ {
        proxy_pass http://api/reports/;    # /api/reports/monthly -> /reports/monthly
        proxy_read_timeout 300s;           # exports take up to 4 minutes
    }
}`, "nginx/conf.d/default.conf"),
        p("Headers are only half of it: the api must trust them. In an Express api that is `app.set(\"trust proxy\", 1)`, which makes `req.ip` the last address in X-Forwarded-For and `req.protocol` follow X-Forwarded-Proto. Trust exactly one hop: nginx is the only proxy, and anything earlier in the header was written by the client."),
        callout("warning", "Never publish the api port next to nginx",
            "If compose.yaml still maps \"3000:3000\" for the api, anyone can skip nginx and send their own X-Forwarded-For. Remove the ports mapping from the api service; nginx reaches it on the Compose network."),

        h2("Verify"),
        code("bash", `
docker compose exec nginx nginx -t        # ... syntax is ok / test is successful
docker compose exec nginx nginx -s reload
curl -s https://ricerocket.vn/api/orders -o /dev/null -w "%{http_code}\\n"   # 200, not 404
docker compose logs --tail=3 api
# api | GET /orders 200 ip=203.0.113.7 proto=https host=ricerocket.vn
time curl -s -o /dev/null -w "%{http_code}\\n" "https://ricerocket.vn/api/reports/monthly?month=2026-10"
# 200 after about 4 minutes, no 504 at 60 s`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**One `proxy_set_header` in a location drops the inherited set.** Detect it by logging `X-Forwarded-Proto` in the api for a request to every location; fix it by keeping all headers at server level or repeating the full set.",
            "**`location /api` without the trailing slash.** It also matches `/apiary`, and with `proxy_pass http://api/` the path `/api/orders` becomes `//orders`. Keep the slash on both sides, or on neither.",
            "**nginx resolves `api` once, when it loads the config.** After the api container is recreated with a new IP, nginx keeps sending to the old one and returns 502 until `nginx -s reload`. The deploy in lesson 8 reloads on every switch for this reason.",
        ]),

        challenge("chal_quiz_dkn_161"),
        p("Now fix the real file. The editor starts from the finished default.conf with its key blocks missing; fill each `[ ]` line by clicking a piece, or drag it onto the line on desktop. Some pieces repeat the mistakes from this lesson. Run checks each request with a routing simulator: where nginx sends it, the path and headers the api receives, and the read timeout."),
        challenge("chal_coding_dkn_162"),
    ],
});
