// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-2-1",
    title: "Compose: the API, Postgres and migrations",
    slug: { _type: "slug", current: "docker-compose-api-postgres-migrations" },
    description:
        "Rice Rocket's first Compose deploy crash-looped on ECONNREFUSED 127.0.0.1:5432, lost the database on `docker compose down` and left Postgres open to the internet. Learn the five Compose rules behind those three incidents - service names, startup conditions, named volumes, published ports and secrets - and fix the compose file for the api, Postgres and a one-shot migration job.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api image from lessons 1-3 now runs next to Postgres on one VPS under Docker Compose. The first deploy went badly three ways: the api crash-looped on boot, a routine `docker compose down` came back with an empty database, and a port scan found Postgres answering on the public IP although ufw only allows SSH and the web.",
    },

    content: [
        h2("Situation"),
        p("This is the compose file from the first deploy. It is valid, `docker compose up -d` starts all three containers, and still:"),
        code("yaml", `
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: rocket
      POSTGRES_DB: rocket
      POSTGRES_PASSWORD: rocket-dev-2024
    ports:
      - "5432:5432"

  migrate:
    image: rice-rocket/api:1.0.0
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL: postgres://rocket:rocket-dev-2024@localhost:5432/rocket
    depends_on:
      - db

  api:
    image: rice-rocket/api:1.0.0
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://rocket:rocket-dev-2024@localhost:5432/rocket
      JWT_SECRET: change-me
    ports:
      - "3000:3000"
    depends_on:
      - db
      - migrate`, "compose.yaml"),
        bullets([
            "The api restarts every few seconds with `Error: connect ECONNREFUSED 127.0.0.1:5432`.",
            "After `docker compose down` and `up`, `select count(*) from orders` returns 0.",
            "`nc -zv <public ip> 5432` succeeds from a laptop at home, and ufw allows only 22, 80 and 443.",
        ]),

        h2("The core you need"),
        bullets([
            "**Service names are hostnames.** Compose puts every service of the project on one network (`<project>_default`) where `db` resolves to the db container. Inside a container, `localhost` is that container, so `@localhost:5432` from the api reaches nothing.",
            "**`depends_on` waits for start, not for ready.** The list form only orders container starts. The map form takes a `condition` per dependency: `service_started`, `service_healthy` (needs a `healthcheck` on that service) or `service_completed_successfully` (a one-shot job that must exit 0).",
            "**Postgres says when it is ready.** `pg_isready` ships in the postgres image and exits 0 once the server accepts connections; use it as the db healthcheck.",
            "**Containers are disposable, volumes are not.** The postgres image declares a VOLUME for `/var/lib/postgresql/data`, so without a mount Docker creates an anonymous volume that the next container does not reuse. A named volume (declared under the top-level `volumes:`) is reattached by name. `docker compose down` keeps it; `docker compose down -v` deletes it.",
            "**`ports:` is for traffic from outside Docker.** `\"5432:5432\"` binds every host interface (0.0.0.0), and Docker's own iptables rules forward that traffic before ufw's rules see it. Services on the same network need no `ports:` at all. `\"127.0.0.1:3000:3000\"` publishes on the loopback interface only.",
            "**Secrets as files.** A top-level `secrets:` entry with `file:` is mounted into each service that lists it at `/run/secrets/<name>`. The postgres image reads `POSTGRES_PASSWORD_FILE`; the api reads `*_FILE` variables the same way as `JWT_SECRET_FILE` in lesson 3.",
        ]),

        h2("Apply it in the project"),
        p("The deploy folder on the VPS holds the compose file and two secret files that never enter git:"),
        code("text", `
/srv/rice-rocket/
  compose.yaml
  secrets/
    db_password.txt    (chmod 644, readable by the container users)
    jwt_secret.txt`, "tree"),
        p("Rewrite the compose file. db gets a named volume, a healthcheck and no published port; migrate runs once db is healthy; api waits for both and talks to `db` by name:"),
        code("yaml", `
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: rocket
      POSTGRES_DB: rocket
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rocket -d rocket"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

  migrate:                      # one-shot: runs the migrations, exits 0
    image: rice-rocket/api:1.0.0
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL: postgres://rocket@db:5432/rocket
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    depends_on:
      db:
        condition: service_healthy
    restart: "no"

  api:
    image: rice-rocket/api:1.0.0
    restart: always             # lesson 5 looks at restart policies
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://rocket@db:5432/rocket
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
      JWT_SECRET_FILE: /run/secrets/jwt_secret
    secrets:
      - db_password
      - jwt_secret
    ports:
      - "127.0.0.1:3000:3000"   # Nginx on this host proxies to it (module 3)
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

volumes:
  pgdata:

secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt`, "compose.yaml"),
        callout("info", "Why migrations get their own service",
            "Running migrations inside the api's start command means two api replicas race to migrate, and a failed migration looks like a crashing api. A one-shot `migrate` service runs once per `up`, and `service_completed_successfully` keeps the api stopped when it exits non-zero."),

        h2("Verify"),
        code("bash", `
docker compose config --quiet             # no output: the file is valid
docker compose up -d
docker compose ps -a --format 'table {{.Service}}\\t{{.Status}}'
# SERVICE   STATUS
# api       Up 15 seconds
# db        Up 32 seconds (healthy)
# migrate   Exited (0) 18 seconds ago
curl -s 127.0.0.1:3000/health             # answers on the VPS itself
sudo ss -tlnp | grep -E ':(5432|3000) '   # only 127.0.0.1:3000, no 5432
docker compose down && docker compose up -d
docker compose exec db psql -U rocket -d rocket -tc 'select count(*) from orders'   # same count as before
docker volume ls                          # local  rice-rocket_pgdata`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**The list form of `depends_on` on a slow first boot.** Postgres initialises the data directory on the first start, and the api connects before it listens: `ECONNREFUSED db:5432` once, then fine after a restart. Detect it in `docker compose logs api` right after a fresh `up`; fix it with `condition: service_healthy`.",
            "**`docker compose down -v` as a habit.** `-v` deletes the named volumes, `pgdata` included. Check `docker volume ls` and take a `pg_dump` before any command with `-v`.",
            "**Rotating the password through `POSTGRES_PASSWORD_FILE`.** The postgres image reads it only when the data directory is empty. With an existing volume, a new file changes nothing in Postgres and the api fails with `password authentication failed`. Change the password with `ALTER ROLE` first, then update the file.",
        ]),

        challenge("chal_quiz_dkn_141"),
        p("Now fix the compose file from the first deploy. The editor starts from the fixed file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first deploy's mistakes on purpose. Run boots the result in a Compose simulator, runs `down` and `up`, and lists every published port."),
        challenge("chal_coding_dkn_142"),
    ],
});
