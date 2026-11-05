// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-3-3",
    title: "Zero-downtime deploys: blue-green behind Nginx",
    slug: { _type: "slug", current: "blue-green-deploy-nginx-zero-downtime" },
    description:
        "Every Rice Rocket deploy meant 20-40 seconds of 502s, and one bad release took 15 minutes to roll back by hand. Learn the blue-green switch on one server: two api services, one upstream file, a health gate, nginx -t before every reload, a drain before the old colour stops, and a rollback that is just a switch back. Then write the deploy plan with its rollback paths.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Deploys run at lunchtime because that is when fixes are ready, which is also when orders peak. Each deploy is `docker compose up -d api`; customers see \"Something went wrong\" for half a minute, and last Friday a release that broke checkout stayed live for 15 minutes while the team rebuilt the previous image.",
    },

    content: [
        h2("Situation"),
        p("This is the whole deploy today, and what nginx logged during the last one:"),
        code("bash", `
docker compose pull api && docker compose up -d api`, "deploy.sh (before)"),
        code("text", `
12:04:10  api  | Recreating rice-rocket-api-1 ... (old container stopped)
12:04:11  nginx| connect() failed (111: Connection refused) while connecting to upstream ... 502
12:04:38  api  | listening on :3000 (migrations checked, pool ready)
12:04:39  nginx| 1,912 requests answered 502 in 28 s`, "logs"),
        p("Compose replaces a container in place: stop the old one, start the new one. The api needs about 25 seconds to become ready, and nginx has nothing else to send traffic to. Rolling back has the same problem, plus finding and pulling the old image first."),

        h2("The core you need"),
        bullets([
            "**Two colours, one switch.** Run the api as two services, `api-blue` and `api-green`. Only one is named in nginx's upstream; that one is live. A deploy starts the new image on the idle colour, next to the live one.",
            "**Gate on health before traffic.** `docker compose up -d --wait` returns only when the service's healthcheck (lesson 5) reports healthy, and fails if it does not. Nothing has changed for users until this gate passes.",
            "**nginx resolves names when it loads the config.** The candidate must be running before you write and test an upstream that names it, or `nginx -t` fails with host not found.",
            "**Test, then reload.** `nginx -t` loads the new files without touching the running server. `nginx -s reload` starts new workers on the new config and lets the old workers finish their in-flight requests on the old one. If a reload cannot load the config, nginx keeps the old one running.",
            "**Drain, then stop.** After the reload, requests already on the old colour still need it. Wait at least as long as the slowest request (300 s for report exports, lesson 6) before stopping it.",
            "**Rollback is a switch back.** Until the old colour is stopped, going back is: write the old upstream, test, reload, stop the candidate. Seconds, not a rebuild.",
        ]),

        h2("Apply it in the project"),
        p("The api service becomes two services with the same settings. Their images live in `.env`, which Compose reads for variable substitution, so a later `docker compose up -d` keeps each colour on its image:"),
        code("yaml", `
services:
  api-blue: &api
    image: \${API_BLUE_IMAGE}
    env_file: .env.api
    healthcheck:                       # the healthcheck from lesson 5
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 3
      start_period: 30s
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
  api-green:
    <<: *api
    image: \${API_GREEN_IMAGE}
  nginx:
    image: nginx:1.28-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro     # the directory, not single files
      - ./nginx/certs:/etc/nginx/certs:ro
      - ./web/dist:/usr/share/nginx/html:ro`, "deploy/compose.yaml"),
        p("The upstream moves out of default.conf into its own file, so the deploy rewrites one small file and nothing else. `default.conf` keeps `proxy_pass http://api/;`:"),
        code("nginx", `
upstream api {
    server api-blue:3000;
}`, "deploy/nginx/conf.d/upstream.conf"),
        p("The deploy script runs the gates in order and has one way out for each failure:"),
        code("bash", `
#!/bin/sh
# ./deploy.sh ricerocket/api:1.8.0
set -u
IMAGE="$1"
LIVE=$(grep -o 'api-[a-z]*' nginx/conf.d/upstream.conf | cut -d- -f2)
if [ "$LIVE" = blue ]; then NEXT=green; else NEXT=blue; fi
VAR="API_$(echo "$NEXT" | tr a-z A-Z)_IMAGE"

ngx() { docker compose exec -T nginx nginx "$@"; }
write_upstream() { printf 'upstream api {\\n    server api-%s:3000;\\n}\\n' "$1" > nginx/conf.d/upstream.conf; }
give_up() { echo "deploy failed: $1"; docker compose stop "api-$NEXT"; exit 1; }

sed -i "s|^$VAR=.*|$VAR=$IMAGE|" .env
docker compose up -d --no-deps --wait --wait-timeout 90 "api-$NEXT" || give_up "health gate"

write_upstream "$NEXT"
ngx -t           || { write_upstream "$LIVE"; give_up "nginx -t"; }
ngx -s reload    || { write_upstream "$LIVE"; give_up "reload"; }

if ! curl -fsS -o /dev/null "https://ricerocket.vn/api/restaurants?limit=1"; then
    write_upstream "$LIVE"; ngx -t && ngx -s reload
    give_up "smoke test"
fi

sleep 300                              # drain: the slowest request is a 4-minute export
docker compose stop "api-$LIVE"
echo "live: $NEXT ($IMAGE)"`, "deploy/deploy.sh"),
        callout("info", "Why the smoke test goes through nginx",
            "The healthcheck proves the process answers. The smoke test sends a real request through the new nginx workers to the new colour, while the old colour is still running and a switch back costs one reload."),

        h2("Verify"),
        code("bash", `
# terminal 1: hit the api 10 times a second, print anything that is not a 200
while true; do curl -s -o /dev/null -w "%{http_code}\\n" "https://ricerocket.vn/api/restaurants?limit=1"; sleep 0.1; done | grep -v "^200$"
# terminal 2
./deploy.sh ricerocket/api:1.8.0        # live: green (ricerocket/api:1.8.0)
cat nginx/conf.d/upstream.conf          # server api-green:3000;
docker compose ps -a api-blue api-green # api-green Up (healthy), api-blue Exited (0)
# terminal 1 stays silent across the switch
./deploy.sh ricerocket/api:1.7.2       # roll back = deploy the previous image to the idle colour`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Stopping the old colour right after the reload.** Requests in flight on old workers still go to it and fail with 502. Detect it in the access log at the stop time; drain for at least the longest `proxy_read_timeout` first.",
            "**Mounting `upstream.conf` as a single file.** A file bind mount follows the original inode; editors and `sed -i` replace the file, so nginx inside the container keeps reading the old content. Mount the directory, and check with `docker compose exec nginx cat /etc/nginx/conf.d/upstream.conf`.",
            "**A migration only the new colour understands.** Blue and green share one Postgres, and blue must keep working during the switch and after a rollback. Add columns and tables first, remove old ones in a later release; dropping or renaming a column in the same release breaks the rollback.",
        ]),

        challenge("chal_quiz_dkn_181"),
        p("Now write the decision logic of the deploy as a pure function: given the live colour and how each gate turns out, return the ordered steps. The editor starts from the function with every gate missing; fill each `[ ]` line by clicking a piece, or drag it onto the line on desktop. Two of the pieces get a rollback wrong."),
        challenge("chal_coding_dkn_182"),
    ],
});
