// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-1-3",
    title: "One image, every environment: config from env",
    slug: { _type: "slug", current: "docker-config-from-environment-secrets-node-api" },
    description:
        "A default baked into Rice Rocket's api image sent staging traffic to the production database, and a typo in PORT made the api listen on the wrong port without a single error. Learn to build one image for every environment, pass configuration and secrets at run time, and make the api refuse to start when its environment is wrong.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Two incidents in one week. A staging deploy wrote test orders into the production database, and a production deploy came up healthy-looking while Nginx returned 502 for twenty minutes during the lunch rush.",
    },

    content: [
        h2("Situation"),
        p("Incident one: the runtime stage of the api Dockerfile had a \"convenient\" default, and the staging compose file was missing `DATABASE_URL` after a rename. The api started without complaint and connected to production:"),
        code("dockerfile", `
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://rice:Pr0d-pass@prod-db.internal:5432/rice_rocket`, "Dockerfile (runtime stage, before)"),
        p("Incident two: someone typed `PORT=30OO` (letter O) in the production environment. The api read it with `parseInt`, which stops at the first non-digit, and logged `listening on 30`. Nginx kept calling port 3000 and got connection refused."),
        p("Both bugs have the same shape: configuration that is wrong, accepted silently. The fix is the same too: the image carries no environment-specific values, and the api checks its whole environment before it opens a port."),

        h2("The core you need"),
        bullets([
            "**Build once, configure at run time.** The same image moves from CI to staging to production; only the environment changes. Anything that differs between them (database, secrets, external URLs) comes from outside the image.",
            "**`ENV` and `ARG` are stored in the image.** `docker image inspect` lists every `ENV`, and `docker history` shows the build arguments used by `RUN` steps. A value set at run time only shadows the baked one in that container.",
            "**Run-time sources.** Compose `environment:` and `env_file:`, or `docker run -e` and `--env-file`. A value set there wins over the image's `ENV`. In a compose file, `${DATABASE_URL:?message}` stops `docker compose up` when the variable is unset or empty.",
            "**Everything in the environment is a string.** Parse and validate it once, at startup, and exit with a non-zero code listing every problem. A container that refuses to start is visible in seconds; a wrong port or database is not.",
            "**Secrets as files.** A Compose secret is mounted as a file at `/run/secrets/<name>`, not as a variable. The convention (used by the official postgres image) is a second variable holding the path: `JWT_SECRET_FILE=/run/secrets/jwt_secret`. Environment variables show up in `docker inspect` and are inherited by every child process; a file does not.",
        ]),

        h2("Apply it in the project"),
        p("Remove the default from the runtime stage. Keep only values that are correct in every environment:"),
        code("dockerfile", `
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`, "Dockerfile (runtime stage)"),
        p("Give each environment its values at run time. The staging compose file requires the database URL and mounts the signing key as a secret:"),
        code("yaml", `
services:
  api:
    image: registry.example.com/rice-rocket/api:1.4.0
    environment:
      PORT: "3000"
      LOG_LEVEL: info
      DATABASE_URL: \${DATABASE_URL:?set DATABASE_URL for staging}
      JWT_SECRET_FILE: /run/secrets/jwt_secret
    secrets:
      - jwt_secret

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt   # on the server only, never in git`, "compose.staging.yml"),
        p("In the api, `src/config.ts` exports `loadConfig(env, files)`, which you write in the challenge below. `src/server.ts` calls it before anything else and exits when it throws:"),
        code("typescript", `
import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "./config.js";

// Read only the secret file the environment points to.
const secretPath = process.env.JWT_SECRET_FILE;
const files = secretPath && existsSync(secretPath) ? { [secretPath]: readFileSync(secretPath, "utf8") } : {};

let config;
try {
  config = loadConfig(process.env, files);
} catch (error) {
  console.error(\`config: \${(error as Error).message}\`);
  process.exit(1);
}
startServer(config);`, "src/server.ts"),
        callout("warning", "A leaked value stays leaked",
            "Removing ENV DATABASE_URL from the Dockerfile fixes the next image only. Every image already pushed still carries the production password, so rotate it and delete the old tags from the registry."),

        h2("Verify"),
        code("bash", `
docker build -t rice-rocket/api:dev .
docker image inspect --format '{{json .Config.Env}}' rice-rocket/api:dev | grep -c -E 'DATABASE_URL|JWT_SECRET'
# 0

docker compose -f compose.staging.yml run --rm -e PORT=80a api; echo "exit $?"
# config: PORT must be an integer from 1 to 65535, got "80a"
# exit 1

docker compose -f compose.staging.yml up -d
docker compose -f compose.staging.yml exec api ls /run/secrets      # jwt_secret
docker compose -f compose.staging.yml exec api printenv JWT_SECRET  # prints nothing`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Secrets passed as build arguments.** `ARG NPM_TOKEN` used by a `RUN` step is recorded in the image history. Check with `docker history --no-trunc <image>`; for build-time secrets use `RUN --mount=type=secret`, which never writes them to a layer.",
            "**Defaults that are only right somewhere.** `process.env.DATABASE_URL ?? \"postgres://localhost/rice\"` turns a forgotten variable into a wrong connection. Default only values that are correct everywhere, and test it: `docker run --rm <image>` with no environment must exit 1 and name DATABASE_URL.",
            "**The newline at the end of a secret file.** `echo key > secrets/jwt_secret.txt` writes `key` plus a newline, and the api signs tokens with a different key than the service that reads the same value from an env variable. Look with `od -c secrets/jwt_secret.txt`, write it with `printf '%s'`, and strip the trailing line break when reading.",
        ]),

        challenge("chal_quiz_dkn_131"),
        p("Now assemble the api's configuration loader. The editor starts from the finished `loadConfig` with its blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose, the way `parseInt` or an early `throw` would be, so check each one against the rules above before you Run."),
        challenge("chal_coding_dkn_132"),
    ],
});
