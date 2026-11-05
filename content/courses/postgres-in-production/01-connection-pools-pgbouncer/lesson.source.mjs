// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-1-1",
    title: "Connection pools and PgBouncer modes",
    slug: { _type: "slug", current: "postgres-connection-pools-pgbouncer" },
    description:
        "At the lunch peak the autoscaler gave Rice Rocket 12 api pods with 20 connections each, and PostgreSQL answered `too many clients`. Learn what a connection costs the server, how to budget connections against the autoscaler's maximum, and what PgBouncer's session, transaction and statement modes keep and break, then write the planner the team runs before scaling.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api runs on Kubernetes with an HPA of 3 to 12 pods, and every pod opens a node-postgres pool of up to 20 connections to the managed PostgreSQL 17 (max_connections 100). The first busy lunch scaled the api to 12 pods and orders failed for 20 minutes.",
    },

    content: [
        h2("Situation"),
        p("The api's logs at 11:52, while the HPA was adding its last pods:"),
        code("text", `
error: sorry, too many clients already
    at Parser.parseErrorMessage (node_modules/pg-protocol/dist/parser.js)
code: '53300', severity: 'FATAL'

$ kubectl -n rice-rocket get hpa api
NAME   REFERENCE        TARGETS   MINPODS   MAXPODS   REPLICAS
api    Deployment/api   91%/70%   3         12        12`, "terminal"),
        p("A quick fix put PgBouncer in front in transaction mode. The errors stopped, and a week later the multi-tenant report started reading the wrong schema now and then."),

        h2("The core you need"),
        bullets([
            "**A PostgreSQL connection is a server process.** Each one costs memory and scheduling even while idle, which is why managed plans cap `max_connections`. Of those, `superuser_reserved_connections` (3 by default) are kept for superusers, and migration jobs, metrics exporters and `psql` sessions take their share too.",
            "**Budget against the autoscaler's maximum.** Every pod's pool can fill up, so the worst case is `max_pods x pool_max`, not the pod count you usually run. That number must fit in `max_connections - reserved - other clients`.",
            "**PgBouncer multiplexes many clients onto few server connections.** Clients connect to PgBouncer (up to `max_client_conn`); PgBouncer keeps at most `default_pool_size` server connections per database and user, and queues the rest. A queue is slower, not broken.",
            "**`pool_mode` decides how long a client keeps a server connection.** `session`: for the whole client connection (no saving with long-lived app pools). `transaction`: for one transaction, the usual choice. `statement`: for one statement, so multi-statement transactions are refused.",
            "**Transaction mode breaks session state.** A plain `SET`, `LISTEN`/`NOTIFY`, session advisory locks (`pg_advisory_lock`), temporary tables used across transactions and `WITH HOLD` cursors live in a server session that the next transaction may not get. `SET LOCAL` and `pg_advisory_xact_lock` live inside the transaction and work. Recent PgBouncer versions (1.21 and later) can also track protocol-level prepared statements when `max_prepared_statements` is above 0.",
        ]),

        h2("Apply it in the project"),
        p("Budget first: 100 - 3 reserved - 7 other clients = 90 server connections. With PgBouncer in transaction mode, the server only sees the transactions running at peak (about 6 per pod, 72 at 12 pods), capped at 40:"),
        code("ini", `
[databases]
rocket = host=db.internal.ricerocket.vn port=5432 dbname=rocket

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 40        ; server connections per database/user pair
max_client_conn = 400         ; 12 pods x 20 = 240 with room for jobs
max_prepared_statements = 200 ; protocol-level prepared statements in transaction mode
server_idle_timeout = 600`, "pgbouncer.ini"),
        p("The api points at PgBouncer instead of the database, and the report keeps its schema inside its own transaction:"),
        code("sql", `
BEGIN;
SET LOCAL search_path TO tenant_42, public;   -- ends with this transaction
SELECT count(*) FROM orders WHERE created_at >= now() - interval '1 day';
COMMIT;`, "reports/tenant-orders.sql"),
        callout("info", "Why not just raise max_connections",
            "Every extra server connection costs memory on the database host, and most of the 240 would sit idle in the pods' pools. A pool in front turns many idle client connections into a few busy server connections."),

        h2("Verify"),
        code("bash", `
psql "host=db.internal.ricerocket.vn dbname=rocket user=admin" -c "
  SELECT usename, application_name, count(*)
  FROM pg_stat_activity WHERE backend_type = 'client backend'
  GROUP BY 1, 2 ORDER BY 3 DESC;"
#  usename   | application_name | count
#  pgbouncer | rocket-api       |    40      <- capped by default_pool_size
#  metrics   | postgres_exporter|     2
psql "host=pgbouncer.rice-rocket port=6432 dbname=pgbouncer user=admin" -c "SHOW POOLS;"
#  cl_active | cl_waiting | sv_active | sv_idle | maxwait | pool_mode
#        40  |         12 |        40 |       0 |       0 | transaction`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Budgeting against today's pod count.** The HPA's `maxReplicas` sets the worst case; recompute the budget whenever someone raises it. Detect it with `count(*)` from `pg_stat_activity` during a load test at full scale.",
            "**Session state behind transaction pooling.** Code that runs `SET`, `LISTEN` or `pg_advisory_lock` outside a transaction works in tests against the database directly and fails in production behind PgBouncer. Grep for them before switching modes, and run integration tests through PgBouncer.",
            "**A pool bigger than the server can take.** In session mode PgBouncer needs one server connection per client; a `default_pool_size` above the budget just moves the `too many clients` error from the pods to PgBouncer.",
        ]),

        challenge("chal_quiz_pgp_111"),
        p("Now write the planner. The editor starts from `pool_planner.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the team's first mistakes on purpose. Run feeds it the outage, the PgBouncer setups the team tried, and two scenarios you have not seen."),
        challenge("chal_coding_pgp_112"),
    ],
});
