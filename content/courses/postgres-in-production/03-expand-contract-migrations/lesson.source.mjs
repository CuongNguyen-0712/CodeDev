// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pgp-2-1",
    title: "Expand and contract migrations without downtime",
    slug: { _type: "slug", current: "postgres-expand-contract-migrations" },
    description:
        "A one-line column rename broke Rice Rocket's old pods for four minutes of a rolling update. Learn why every migration has to work with two versions of the code at once, and ship the same change as expand and contract: add, dual write, backfill in batches, switch, and drop only when the old code is gone.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Couriers call customers through a VoIP provider that wants phone numbers in E.164 format. The team renamed `orders.customer_phone` to `phone_e164` in the same release that changed the code, and every order placed through an old pod failed until the rollout finished.",
    },

    content: [
        h2("Situation"),
        p("The release contained one migration and the code that used the new name. The migration ran first, as the deploy job always does, then the rolling update replaced the six api pods two at a time:"),
        code("sql", `
ALTER TABLE orders RENAME COLUMN customer_phone TO phone_e164;
UPDATE orders SET phone_e164 = '+84' || substr(phone_e164, 2);`, "migrations/0042_phone_e164.sql"),
        code("text", `
09:14:02 api-6f9c7d-k2x8q  ERROR  column "customer_phone" does not exist
09:14:02 api-6f9c7d-k2x8q  POST /orders 500
...
09:18:11 api-6f9c7d-p7d4w  ERROR  column "customer_phone" does not exist
09:18:13 deployment "api" successfully rolled out`, "api logs"),
        bullets([
            "For 4 minutes every request served by an old pod (`api-6f9c7d-*`) failed: about a third of all orders at the time.",
            "The second statement updated 18 million rows in one transaction; courier status updates on those orders waited behind it.",
            "Rolling back the code did not help: the old code needs a column that no longer exists.",
        ]),

        h2("The core you need"),
        bullets([
            "**Two versions run at once.** A rolling update replaces pods a few at a time, and the HPA may add old pods during it. The migration runs once, so the schema after it must work for the old code and for the new code.",
            "**Expand.** Only additive, backward compatible changes: a new nullable column, a new table, a new index built concurrently. Old code does not notice them.",
            "**Keep both sides filled.** New code writes both columns. Rows that old pods still insert get the new value from a trigger (or from the new code reading the old column as a fallback).",
            "**Backfill in batches.** Existing rows are converted a few thousand at a time, each batch its own short transaction, so row locks are released at once and the job can stop and resume. A single `UPDATE` over the table holds every row lock until it commits.",
            "**Switch, then contract later.** Reads move to the new column in a release of their own. Dropping the old column, the trigger or the fallback is a later release, after no pod runs code that uses them.",
            "Each step can be rolled back on its own, because each one leaves a schema that both neighboring code versions accept.",
        ]),

        h2("Apply it in the project"),
        p("Release 1 adds the column and the trigger that fills it for rows inserted by the old code:"),
        code("sql", `
ALTER TABLE orders ADD COLUMN phone_e164 text;   -- nullable, no default: catalog only

CREATE FUNCTION orders_phone_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone_e164 IS NULL AND NEW.customer_phone IS NOT NULL THEN
    NEW.phone_e164 := '+84' || substr(NEW.customer_phone, 2);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER orders_phone_sync BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_phone_sync();`, "migrations/0042_expand_phone_e164.sql"),
        p("The backfill runs as a job after the migration, one batch per transaction, until a batch changes no row:"),
        code("sql", `
UPDATE orders
SET phone_e164 = '+84' || substr(customer_phone, 2)
WHERE id IN (
  SELECT id FROM orders
  WHERE phone_e164 IS NULL AND customer_phone IS NOT NULL
  ORDER BY id
  LIMIT 5000
);
-- repeat until "UPDATE 0"`, "jobs/backfill_phone_e164.sql"),
        p("Release 2 ships code that writes both columns and reads `phone_e164`; its migration is empty. Release 3 ships code that uses only `phone_e164`. Once that rollout has finished, the contract migration removes what only the old code needed:"),
        code("sql", `
DROP TRIGGER orders_phone_sync ON orders;
DROP FUNCTION orders_phone_sync();
ALTER TABLE orders DROP COLUMN customer_phone;`, "migrations/0045_contract_customer_phone.sql"),
        callout("info", "Where the release boundaries come from",
            "A release is done when `kubectl rollout status` reports success and no old ReplicaSet has pods. The contract migration ships with the release after that, never with the one that removed the last use of the column."),

        h2("Verify"),
        code("bash", `
psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE phone_e164 IS NULL) AS missing FROM orders"
#  missing
# ---------
#        0
psql "$DATABASE_URL" -c "SELECT pid, now() - xact_start AS xact_age, query FROM pg_stat_activity WHERE query LIKE 'UPDATE orders SET phone_e164%'"
# each batch shows an xact_age well under a second
kubectl -n rice-rocket get rs -l app.kubernetes.io/name=api   # only the current ReplicaSet has pods before the contract`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Contract in the same release as the switch.** Dropping the old column while old pods still run repeats the outage. Detect it in review: a `DROP COLUMN` or `DROP TRIGGER` must name a column that no deployed version uses.",
            "**Backfill without the sync trigger.** Rows that old pods insert after the backfill passed them stay NULL, and the new code reads empty phone numbers. Check the NULL count again after the rollout, not only after the backfill.",
            "**One huge `UPDATE`.** It holds row locks and keeps old row versions from being vacuumed until it commits. `pg_stat_activity` shows the backfill with a long `xact_age` and other updates waiting on `transactionid`.",
        ]),

        challenge("chal_quiz_pgp_131"),
        p("Now ship the change again, properly. The editor holds the migration plan with its key steps missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the original mistakes on purpose. Run replays the three releases on SQLite with traffic from every app version between every step."),
        challenge("chal_coding_pgp_132"),
    ],
});
