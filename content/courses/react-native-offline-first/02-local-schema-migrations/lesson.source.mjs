// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-1-2",
    title: "Local storage schema and migrations",
    slug: { _type: "slug", current: "react-native-sqlite-migrations" },
    description:
        "A courier app update ran a migration that crashed half way, and the phones it hit claimed the new schema version without the new column. Learn how the courier app's SQLite database is versioned with PRAGMA user_version, why each migration and its version number must commit together, and how to refuse a database written by a newer build.",
    estimatedTime: 15,

    scenario: {
        role: "Mobile developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Release 2.3 adds the cash to collect on each delivery. In 2.2 an upgrade that the OS killed in the middle left some phones unable to open the app until the courier reinstalled it, losing every action still waiting in the outbox.",
    },

    content: [
        h2("Situation"),
        p("The 2.2 upgrade code, and what the support team pulled from an affected phone:"),
        code("ts", `
async function upgrade(db: SQLiteDatabase) {
  const { user_version } = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if (user_version < 2) {
    await db.execAsync("PRAGMA user_version = 2");
    await db.execAsync("CREATE TABLE outbox (id TEXT PRIMARY KEY, kind TEXT, payload TEXT, attempts INTEGER)");
  }
}`, "src/db/upgrade.ts"),
        code("text", `
sqlite> PRAGMA user_version;
2
sqlite> SELECT name FROM sqlite_master WHERE type = 'table';
deliveries
# no outbox table: the app was killed between the two statements
[app] SQLiteError: no such table: outbox`, "phone dump"),
        bullets([
            "The version was written first and the schema change second, in two separate commits.",
            "Android killed the app (low memory, the courier swiped it away) between them.",
            "Every later start saw version 2, skipped the migration, and crashed on the missing table.",
        ]),

        h2("The core you need"),
        bullets([
            "**The schema version lives in the database.** `PRAGMA user_version` is an integer SQLite keeps in the file header, 0 for a new database. The app compares it with the version its code expects.",
            "**Migrations are an ordered list, run from the stored version up.** Each entry has a version and the statements that reach it; only entries above the stored version run, in ascending order.",
            "**A migration and its version commit together.** Run the statements and `PRAGMA user_version = N` inside one transaction (`withTransactionAsync` / `withExclusiveTransactionAsync` in expo-sqlite). SQLite's journal guarantees that a killed app leaves either the old state or the new one, never half.",
            "**Adding a NOT NULL column needs a default.** `ALTER TABLE ... ADD COLUMN cod_amount INTEGER NOT NULL DEFAULT 0` fills existing rows; without the default SQLite refuses with \"Cannot add a NOT NULL column with default value NULL\".",
            "**A newer database is not yours to touch.** A phone can run an older build than the database it has (a rollback through the store, a restored backup). Stop with a clear message rather than guessing at an unknown schema.",
            "**Run it before any screen reads.** `SQLiteProvider` takes an `onInit` callback that runs before its children render; migrations go there.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
import { type SQLiteDatabase } from "expo-sqlite";

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: "CREATE TABLE deliveries (id TEXT PRIMARY KEY, address TEXT NOT NULL, status TEXT NOT NULL)" },
  { version: 2, sql: "CREATE TABLE outbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)" },
  { version: 3, sql: "ALTER TABLE deliveries ADD COLUMN cod_amount INTEGER NOT NULL DEFAULT 0" },
  { version: 4, sql: "CREATE INDEX idx_deliveries_status ON deliveries (status)" },
];
export const APP_DB_VERSION = 4;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  if (current > APP_DB_VERSION) {
    throw new Error(\`database version \${current} is newer than this app (\${APP_DB_VERSION}): update the app\`);
  }
  for (const m of MIGRATIONS.filter((m) => m.version > current)) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(m.sql);
      await tx.execAsync(\`PRAGMA user_version = \${m.version}\`);
    });
  }
}`, "src/db/migrations.ts"),
        code("tsx", `
<SQLiteProvider databaseName="courier.db" onInit={migrateDbIfNeeded} onError={showUpdateRequired}>
  <App />
</SQLiteProvider>`, "app/_layout.tsx"),
        callout("info", "Migrations are append-only",
            "Once a version has shipped, its entry never changes: phones that already ran it would not run it again. Fix a mistake with a new version (v5 that corrects v4), and keep the list in one file the code review can see whole."),

        h2("Verify"),
        code("bash", `
# install 2.2 on an emulator, create a few deliveries, then install the 2.3 build over it
npx expo run:android --variant release
adb shell "run-as vn.ricerocket.courier sqlite3 files/SQLite/courier.db 'PRAGMA user_version; PRAGMA table_info(deliveries);'"
# 4
# ...|cod_amount|INTEGER|1|0|0
# kill the app in the middle of an upgrade (a test build sleeps inside v3), then start it again:
adb shell am force-stop vn.ricerocket.courier && adb shell monkey -p vn.ricerocket.courier 1
# the version is still 2 after the kill, and 4 after the restart`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Version written outside the migration's transaction.** Any `PRAGMA user_version` that is not the last statement inside the same transaction recreates the 2.2 bug. Search the migration code for `user_version` and check where each one runs.",
            "**`>=` instead of `>` when picking migrations.** The current version runs again and fails with \"duplicate column name\" or \"table already exists\" on every start. A test that starts twice on an up-to-date database catches it.",
            "**Dropping and recreating tables to change them.** `DROP TABLE outbox` in a migration deletes actions the courier has not synced yet. Copy rows into the new table inside the same transaction, then drop the old one.",
        ]),

        p("Now write the upgrade code. The editor starts from `migrate` and the migration list with their key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the 2.2 mistakes on purpose. Run starts the app on databases at different versions, kills it during an upgrade and prints the schema each start leaves behind."),
        challenge("chal_coding_rno_122"),
    ],
});
