// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-2-3",
    title: "Delta sync with cursors",
    slug: { _type: "slug", current: "react-native-delta-sync-cursors" },
    description:
        "Rice Rocket's courier app downloaded every delivery on every resume, then switched to \"changes since my clock\" and started missing updates and keeping cancelled jobs. Learn delta sync with a server-issued cursor: pages until the end, tombstones for deletions, the cursor saved in the same transaction as the rows, and a full resync when the cursor is too old.",
    estimatedTime: 16,

    scenario: {
        role: "Mobile developer on Rice Rocket's courier app (React Native, Expo)",
        problem:
            "Couriers open the app dozens of times a shift, often on 3G. The full download of their deliveries took seconds and ate mobile data; the first delta version was fast but wrong: some status changes never arrived, and deliveries cancelled by dispatch stayed on the courier's list.",
    },

    content: [
        h2("Situation"),
        p("The first delta version asked for everything updated after the last sync time, read from the phone's clock:"),
        code("ts", `
const since = await kv.get("lastSyncAt");             // the phone's clock at the last sync
const res = await fetch(\`\${API}/deliveries?updatedSince=\${since}\`);
const { deliveries } = await res.json();
await upsertAll(deliveries);
await kv.set("lastSyncAt", new Date().toISOString());`, "src/sync/deliveries.ts (v2.1)"),
        bullets([
            "A courier whose phone ran 4 minutes fast never received status changes made in those 4 minutes.",
            "Two orders updated in the same millisecond as the last sync were skipped: the next request asked for `> since`.",
            "Deliveries cancelled by dispatch were simply absent from the answer, so they stayed on the phone forever.",
            "The app was killed between `upsertAll` and `kv.set` a few times a day; the next sync downloaded the same rows again, which was harmless, but in the reverse order it would have skipped them.",
        ]),

        h2("The core you need"),
        bullets([
            "**The server owns the position.** The server keeps a change log (each change gets an increasing sequence number) and returns an opaque `nextCursor` with every page. The app stores the cursor and sends it back; it never compares its own clock with the server's.",
            "**Deletions are changes too.** A cancelled or reassigned delivery comes back as a tombstone `{ id, deleted: true }` so the phone can remove it. A query of current rows cannot tell you what disappeared.",
            "**Pages until `hasMore` is false.** The server caps a page (here 100); a courier back from a dead zone may need several pages in one sync.",
            "**Rows and cursor in one transaction.** Write a page's upserts, its deletions and its cursor in the same SQLite transaction. If the app dies in the middle, none of it is on disk and the next start asks for the same page again; applying a page twice is harmless because each change carries the full row and its version.",
            "**A cursor can expire.** The server compacts its log; a phone that was offline for weeks gets 410 Gone. The app then clears its copy and does a full download once, from a null cursor.",
        ]),

        h2("Apply it in the project"),
        p("The server side is one endpoint over the change log (`GET /sync/deliveries?cursor=...&limit=100`). On the phone the sync runs inside expo-sqlite's transaction helper:"),
        code("ts", `
import * as SQLite from "expo-sqlite";

const db = await SQLite.openDatabaseAsync("courier.db");

export async function syncDeliveries(api: SyncApi): Promise<void> {
  let cursor = (await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key = 'deliveries'"))?.value ?? null;
  let restarted = false;
  for (;;) {
    let page: Page;
    try {
      page = await api.changes({ cursor, limit: 100 });
    } catch (e) {
      if (e instanceof HttpError && e.status === 410 && !restarted) {
        restarted = true;
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync("DELETE FROM deliveries");
          await tx.runAsync("DELETE FROM sync_state WHERE key = 'deliveries'");
        });
        cursor = null;
        continue;
      }
      throw e;
    }
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const c of page.changes) {
        if (c.deleted) await tx.runAsync("DELETE FROM deliveries WHERE id = ?", c.id);
        else await tx.runAsync(
          "INSERT INTO deliveries (id, version, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data",
          c.id, c.version, c.data);
      }
      await tx.runAsync("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('deliveries', ?)", page.nextCursor);
    });
    cursor = page.nextCursor;
    if (!page.hasMore) return;
  }
}`, "src/sync/deliveries.ts"),
        callout("info", "Which transaction helper",
            "expo-sqlite offers `withTransactionAsync` and `withExclusiveTransactionAsync`; the exclusive one keeps other queries on the connection out of the transaction while it runs. Check the documentation of the expo-sqlite version in your SDK; the names have changed between major versions."),

        h2("Verify"),
        code("bash", `
# Dev build on a device, network throttled to 3G in the OS developer options
npx expo run:android
# In the app's debug menu: "Sync now", twice
adb logcat -s ReactNativeJS | grep sync
# sync: page 1 (100 changes), page 2 (37 changes), done
# sync: page 1 (0 changes), done            <- second sync downloads nothing
# Kill the app during a large sync (adb shell am force-stop app.ricerocket.courier), start it again:
# sync: page 2 (100 changes) ...           <- the interrupted page is fetched again, no gap`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Saving the cursor outside the transaction.** If the cursor is written first and the app dies before the rows, the next sync starts after changes the phone never stored. Detect it by killing the app mid-sync in a test and comparing the local table with the server.",
            "**Filtering deletions out on the server.** An endpoint that returns only live rows makes cancelled deliveries immortal on the phone. Check that the change feed contains tombstones and that the app handles them.",
            "**Treating 410 as a crash.** A phone that was off for a month must recover by itself. Detect it with a server test that compacts the log and then syncs an old cursor: the app should end with exactly the server's rows.",
        ]),

        p("Now write the sync. The editor holds `syncDeltas(api, store)` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run plays a day of server changes and app starts, kills the app in the middle of a page, and prints the deliveries left on the phone."),
        challenge("chal_coding_rno_162"),
    ],
});
