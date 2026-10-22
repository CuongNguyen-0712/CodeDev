// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-2-2",
    title: "Configuration through environment variables",
    slug: { _type: "slug", current: "devops-configuration-environment-variables-secrets" },
    description:
        "Rice Rocket's production database password was baked into the api image with ENV, where anyone who pulled the image could read it with docker history. The same week, staging wrote test orders into the production database because the code had a hard-coded default URL, and DEBUG=false turned debug mode on. Learn why configuration belongs to the environment and not the image, where environment variables come from (ENV, ARG, docker run, env files, Compose, secret stores), how to use build secrets, and how to load, type-check and mask configuration so a bad deploy refuses to start.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "A contractor pulled the api image from the registry to debug a performance problem and asked, in a public channel, why the production database password is in docker history. While you were rotating it, the data team noticed test orders in the production database: staging had been writing there for two days. And production showed full Python stack traces to customers, because DEBUG=false in the deploy config switched debug mode on. You are asked to find out how, fix it, and make sure the next wrong setting stops the deploy instead of reaching customers.",
    },

    content: [
        h2("1. The incident"),
        p("Three bugs, one root cause: configuration in the wrong place, read the wrong way. First, the Dockerfile:"),
        code("dockerfile", `
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV DATABASE_URL=postgres://api:Pr0d-Rice-2026@db.prod.internal:5432/ricerocket
CMD ["python", "-m", "api"]`, "Dockerfile"),
        p("Then the settings module of the api:"),
        code("python", `
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://api:Pr0d-Rice-2026@db.prod.internal:5432/ricerocket",  # "so it works locally"
)
DEBUG = bool(os.environ.get("DEBUG", False))
PORT = int(os.environ.get("PORT", 8080))`, "api/settings.py"),
        bullets([
            "**The password is in the image.** `ENV` writes the value into the image config. Every copy of the image - in the registry, on CI runners, on the contractor's laptop - carries it, and `docker history` prints it.",
            "**Staging used production.** The staging deploy forgot to set `DATABASE_URL`. Instead of failing, the code fell back to its default - the production URL - and staging's test orders went into the real database for two days.",
            "**`DEBUG=false` turned debug on.** Environment variables are always strings. `bool(\"false\")` is `True`, because any non-empty string is true. Production showed stack traces, with file paths and settings, to customers.",
        ]),

        h2("2. Reproduce it"),
        p("Build the image above and look at it the way anyone with pull access can:"),
        code("bash", `
docker build -t api:leaky .
docker history --no-trunc api:leaky | grep DATABASE_URL
docker inspect --format '{{json .Config.Env}}' api:leaky`),
        p("Both commands print the full URL with the password (output similar to this):"),
        code("text", `
<missing>  2 minutes ago  ENV DATABASE_URL=postgres://api:Pr0d-Rice-2026@db.prod.internal:5432/ricerocket  0B  buildkit.dockerfile.v0
["PATH=/usr/local/bin:/usr/local/sbin:...","LANG=C.UTF-8",...,"DATABASE_URL=postgres://api:Pr0d-Rice-2026@db.prod.internal:5432/ricerocket"]`),
        p("And the DEBUG bug, in two lines of Python:"),
        code("python", `
>>> bool("false"), bool("0"), bool("no"), bool("")
(True, True, True, False)`),

        h2("3. Configuration belongs to the environment"),
        p("**Configuration** is everything that differs between deploys of the same code: database and Redis URLs, passwords and API keys, the port, the log level, feature flags, how many workers to run. The Twelve-Factor App rule is short: **store config in the environment**, never in the code or the image."),
        bullets([
            "**One image, every environment.** CI builds `api:2026.10.3` once. The same image runs on a laptop, in staging and in production; each environment gives it different variables. What you tested in staging is byte for byte what you ship.",
            "**Secrets stay out of the artifact.** An image is copied to many places and kept for months. A variable injected at run time lives only in the running container and the system that started it.",
            "**Changing config is cheap.** Rotating a password is a restart with a new value, not a rebuild and a new release.",
        ]),
        image("build-vs-run-config", {
            alt: "Two panels. Left panel, red, Baked in at build time: a Dockerfile with ENV DATABASE_URL=postgres://api:Pr0d...@db.prod leads to the image api:2026.10.3 in the registry, where the URL and password are in the image config, which leads to everyone who pulls the image: docker history --no-trunc and docker inspect print the production password, and staging and laptops connect to the production DB. Footer: changing the password means rebuilding the image, and old copies of the image keep the old one forever. Right panel, green, Injected at run time: one image api:2026.10.3 with no URLs and no passwords, the same in every environment, feeds two environments: staging gets its env from the staging secret store with DATABASE_URL = db.staging and DEBUG = false, production gets its env from the production secret store with DATABASE_URL = db.prod and DEBUG = false. Footer: the app checks every variable at startup and refuses to start when one is missing or invalid; rotating a password needs a restart, not a rebuild. Bottom note: ENV and ARG values persist in the image and its history; pass secrets at run time with -e, --env-file, Compose or a secret store.",
            caption: "The image is shared with everyone who can pull it; configuration and secrets come from the environment it runs in.",
        }),

        h2("4. Where environment variables come from"),
        p("A container's environment is assembled from several places. Know which ones end up **inside the image**:"),
        bullets([
            "**`ENV` in the Dockerfile** - stored in the image config. Fine for values that are the same everywhere and not secret (`ENV PYTHONUNBUFFERED=1`, `ENV PATH=...`). Never for secrets or per-environment values.",
            "**`ARG` in the Dockerfile** - a build-time variable, set with `docker build --build-arg NAME=value`. It is not in the running container's environment, but it is **not secret either**: build argument values persist in the image metadata, and a `RUN` step that uses one shows it in `docker history`.",
            "**`docker run -e NAME=value`** or **`-e NAME`** (copies `NAME` from your shell) - set for this container only.",
            "**`docker run --env-file staging.env`** - reads `NAME=value` lines from a file. One file per environment, kept out of git.",
            "**Compose** - `environment:` and `env_file:` in `compose.yaml`. When both set the same variable, `environment:` wins. Compose also reads a `.env` file next to `compose.yaml` to fill in `${VARIABLE}` placeholders in the file itself.",
            "**A secret store** - Kubernetes Secrets, cloud secret managers, or Compose `secrets:` deliver secrets to the container at run time, often as files under `/run/secrets/` instead of variables.",
        ]),
        code("yaml", `
services:
  api:
    image: registry.example.com/ricerocket/api:2026.10.3
    env_file: staging.env            # DATABASE_URL, PAYMENT_API_KEY, ...
    environment:
      LOG_LEVEL: INFO                # overrides LOG_LEVEL from staging.env
      DEBUG: "false"                 # quoted: YAML would turn false into a boolean
    ports:
      - "8000:8080"`, "compose.staging.yaml"),
        p("`docker compose -f compose.staging.yaml config` prints the file with every value filled in - useful to check what a container will really get (and a reason to be careful where you paste that output)."),

        h2("5. Secrets during the build"),
        p("Sometimes the **build** needs a secret: a token for a private package index, for example. Passing it with `ARG` or `ENV` puts it in the image. BuildKit has a **secret mount** for this: the secret is available as a file during one `RUN` step and is never written to a layer or the history:"),
        code("dockerfile", `
# syntax=docker/dockerfile:1
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=pip_token \\
    PIP_INDEX_URL="https://__token__:$(cat /run/secrets/pip_token)@pypi.ricerocket.internal/simple" \\
    pip install --no-cache-dir -r requirements.txt`, "Dockerfile"),
        code("bash", `
export PIP_TOKEN=...                                        # from your password manager or CI secrets
docker build --secret id=pip_token,env=PIP_TOKEN -t api:dev .`),
        p("`env=PIP_TOKEN` reads the secret from an environment variable of the build command; `src=./token.txt` would read it from a file. Inside the build, it is the file `/run/secrets/pip_token`, only for that `RUN`."),

        h2("6. .env files"),
        p("A `.env` file is a convenient way to keep local values together - and the easiest way to leak them. Three rules:"),
        numbered([
            "**`.env` is in `.gitignore`**, so it is never committed, and in `.dockerignore`, so `COPY . .` never puts it in an image.",
            "**Commit a `.env.example`** with every variable name, safe defaults and fake values, so a new developer knows what to set.",
            "**Production values never live in a file on a laptop.** They come from the CI system's secrets or a secret store.",
        ]),
        code("text", `
# .env.example - copy to .env and fill in. Never commit .env.
PORT=8080
DEBUG=true
DATABASE_URL=postgres://api:change-me@localhost:5432/ricerocket
REDIS_URL=redis://localhost:6379/0
LOG_LEVEL=DEBUG
PAYMENT_API_KEY=pk_test_replace_me`, ".env.example"),

        h2("7. Reading configuration in Python"),
        h3("Required means required"),
        p("A default is fine for a value that is safe everywhere (`PORT=8080`, `LOG_LEVEL=INFO`). A value that **differs per environment or is secret** has no safe default. `os.environ[\"DATABASE_URL\"]` raises `KeyError` when it is missing - a crash at startup is exactly what you want, compared with two days of test orders in production."),
        h3("Parse types on purpose"),
        p("Every value arrives as a string. Convert it with rules you choose, and reject what you do not understand:"),
        code("python", `
TRUE, FALSE = {"true", "yes", "1"}, {"false", "no", "0"}

def env_bool(text):
    value = text.strip().lower()
    if value in TRUE:
        return True
    if value in FALSE:
        return False
    raise ValueError(f"not a boolean: {text!r}")

env_bool("false")   # False
env_bool(" YES ")   # True
env_bool("flase")   # ValueError: not a boolean: 'flase'`),
        bullets([
            "**`int()` is more generous than you think**: `int(\" 42 \")`, `int(\"+4\")` and `int(\"1_000\")` all work. If a config value should be plain digits, check it with a regular expression such as `-?[0-9]+` first.",
            "**URLs**: `urllib.parse.urlsplit` splits a URL into scheme, host, port and path. A value like `db.prod.internal:5432/ricerocket` (no `postgres://`) has no host after parsing - reject it at startup instead of failing on the first query.",
            "**Fixed choices**: a log level must be one of a short list; compare against the list instead of passing any string on.",
            "**Empty is not set**: `DEBUG=` in an env file gives an empty string. Treat it like a missing variable, not like a value.",
        ]),
        h3("Fail fast, with every problem at once"),
        p("Check **all** variables at startup, collect every problem, then stop with a non-zero exit code and the whole list. A deploy with three mistakes should need one fix, not three failed rollouts - the same idea as reporting every bad row of an import."),
        h3("Never print a secret"),
        p("Logging the loaded configuration at startup is useful - mask the secrets. That includes **error messages**: `DATABASE_URL: not a URL: 'postgres//api:Pr0d-Rice-2026@...'` just leaked the password into the logs. Say `(value hidden)` instead."),
        callout("warning", "Logs are copied everywhere",
            "Application logs go to the terminal, the log platform, alert messages, screenshots in chat and tickets. Treat anything you print as public inside the company. A secret that reaches a log has to be rotated."),

        h2("8. Your turn"),
        p("Write the startup check for Rice Rocket's api. It gets a schema - name, type, optional default, secret flag, limits - and the environment, and returns the typed config or the full list of problems, without ever showing a secret."),
        challenge("chal_coding_devf_221", "Go through the schema in order. Strip the value; treat empty as missing; use the default or record \"required but not set\". Parse by type with small helpers that return either a value or an error message, and choose the text for <value> once: repr(value), or (value hidden) for a secret. Only build the config when the error list is empty."),

        h2("9. Fixing the incident"),
        numbered([
            "**Rotate the password first.** Deleting the image tag does not help: copies of the image are already on laptops, CI runners and in registry caches. Treat the old password as public, change it in the database and in the secret store, and restart production with the new value.",
            "**Remove the `ENV` line** and rebuild. The image no longer contains any URL or password; `docker history` shows only harmless settings.",
            "**Remove the defaults** for `DATABASE_URL` and the payment key from `settings.py`. A missing value now stops the app at startup.",
            "**Parse `DEBUG` and the other typed values** with explicit rules, and run the full check at startup - the function you just wrote.",
            "**Give staging its own `staging.env`** from the staging secret store, and add `.env` files to `.gitignore` and `.dockerignore`.",
        ]),
        p("The next time staging forgets a variable, the deploy fails in seconds with `DATABASE_URL: required but not set`, and nobody's test order reaches a real restaurant."),

        h2("10. Pitfalls"),
        bullets([
            "**Secrets in `ENV` or `ARG`**: they persist in the image and its history. Use run-time variables, a secret store, or a BuildKit secret mount during the build.",
            "**Production values as code defaults**: a forgotten variable silently points staging at production.",
            "**`bool(os.environ[...])`**: every non-empty string is true, including `\"false\"` and `\"0\"`.",
            "**Unquoted booleans in YAML**: `DEBUG: false` in Compose is a YAML boolean, and other YAML tools turn it into `False` or `0`; Docker's docs ask you to quote booleans so the container gets exactly the text you wrote. Quote values: `DEBUG: \"false\"`.",
            "**Committing `.env`**, or copying it into the image with `COPY . .`.",
            "**Stopping at the first config error**: each fix needs another failed deploy.",
            "**Printing secrets** in startup logs or in validation error messages.",
        ]),

        h2("11. Checklist"),
        bullets([
            "The image contains no secrets and no per-environment values; `docker history` and `docker inspect` show nothing sensitive.",
            "The same image is promoted from staging to production; only the environment differs.",
            "Secrets come from the CI system or a secret store at run time; build-time secrets use `RUN --mount=type=secret`.",
            "`.env` is in `.gitignore` and `.dockerignore`; a `.env.example` documents every variable.",
            "Variables that differ per environment have no default in code; missing ones stop the app at startup.",
            "Booleans, numbers, URLs and choices are parsed with explicit rules; empty means not set.",
            "Startup reports every config problem at once and exits non-zero; secrets are masked in logs and error messages.",
        ]),
    ],
});
