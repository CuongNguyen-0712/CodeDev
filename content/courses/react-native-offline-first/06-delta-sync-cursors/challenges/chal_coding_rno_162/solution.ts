import { readFileSync } from "node:fs";

// Rice Rocket courier app: "My deliveries" lives on the phone (expo-sqlite) and is kept up to date with
// delta sync. The server keeps a change log and hands out an opaque cursor meaning "you have everything up
// to here"; the app never asks for changes by the phone's clock.
//   api.changes({ cursor, limit })  the changes after `cursor` (null = a full download), at most `limit`
//                                   (the server may send fewer): { changes, nextCursor, hasMore }.
//                                   A change is { id, version, deleted, data }; deleted = the delivery was
//                                   cancelled or moved to another courier.
//                                   Throws HttpError(410) when the cursor is older than the server keeps.
//   store.cursor()                  the cursor saved with the last applied page (null on a fresh install)
//   store.setCursor(c)              saves a cursor at once, outside any transaction
//   store.transaction(fn)           runs fn(tx) all or nothing: if the app is killed or fn throws, none
//                                   of it is on disk. tx.upsert(id, version, data), tx.remove(id),
//                                   tx.clear() (every row), tx.setCursor(c)
interface Change { id: string; version: number; deleted: boolean; data: string | null }
interface Page { changes: Change[]; nextCursor: string; hasMore: boolean }
interface Api { changes(request: { cursor: string | null; limit: number }): Page }
interface Tx {
    upsert(id: string, version: number, data: string | null): void;
    remove(id: string): void;
    clear(): void;
    setCursor(cursor: string | null): void;
}
interface Store { cursor(): string | null; setCursor(cursor: string | null): void; transaction(fn: (tx: Tx) => void): void }
class HttpError extends Error {
    status: number;
    constructor(status: number) {
        super(`HTTP ${status}`);
        this.status = status;
    }
}

/** Brings the local deliveries up to date with the server. */
function syncDeltas(api: Api, store: Store): { pages: number; resynced: boolean } {
    let resynced = false;
    let pages = 0;
    // @piece start-cursor: Where the last finished sync stopped
    let cursor = store.cursor();
    // @end
    for (;;) {
        let page: Page;
        try {
            // @piece fetch-page: Ask the server for the next page of changes
            page = api.changes({ cursor, limit: 100 });
            // @end
        } catch (error) {
            // @piece expired-cursor: Start over when the server no longer has the cursor
            if (error instanceof HttpError && error.status === 410 && !resynced) {
                resynced = true;
                store.transaction((tx) => {
                    tx.clear();
                    tx.setCursor(null);
                });
                cursor = null;
                continue;
            }
            throw error;
            // @end
        }
        pages++;
        // @piece apply-page: Apply the page and keep its cursor, all or nothing
        store.transaction((tx) => {
            for (const change of page.changes) {
                if (change.deleted) tx.remove(change.id);
                else tx.upsert(change.id, change.version, change.data);
            }
            tx.setCursor(page.nextCursor);
        });
        // @end
        cursor = page.nextCursor;
        // @piece loop-until-done: Stop once the server has nothing more
        if (!page.hasMore) return { pages, resynced };
        // @end
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { serverPageSize, local?: { rows: [{ id, version, data }], cursorSeq }, steps: [...] }
//   { server: [{ id, version, deleted?, data? }] }  the server appends these changes to its log
//   { expireBefore: n }                             the server forgets log entries before seq n:
//                                                   a cursor that still needs them gets 410
//   { sync: true, killAt?: { page, afterWrites } }  the app runs syncDeltas; killAt kills it during the
//                                                   transaction of its page-th page, after that many writes
// A null cursor gets a full download (here: the whole log). Cursors encode the last log seq sent.
// Output: the rows on the phone ("id@version"), whether the saved cursor is at the end of the log,
// pages served, syncs that had to start over, kills and unexpected errors.
class Killed extends Error {}
interface Step { server?: { id: string; version: number; deleted?: boolean; data?: string }[]; expireBefore?: number; sync?: boolean; killAt?: { page: number; afterWrites: number } }
const input = JSON.parse(readFileSync(0, "utf8")) as {
    serverPageSize: number;
    local?: { rows: { id: string; version: number; data: string }[]; cursorSeq: number };
    steps: Step[];
};

const log: (Change & { seq: number })[] = [];
let expireBefore = 0;
let pagesServed = 0;
let pagesThisSync = 0;
const encode = (seq: number) => Buffer.from(`deliveries:${seq}`).toString("base64url");
const decode = (cursor: string) => Number(Buffer.from(cursor, "base64url").toString().split(":")[1]);

const api: Api = {
    changes({ cursor, limit }) {
        const after = cursor === null ? -1 : decode(cursor);
        if (cursor !== null && after < expireBefore - 1) throw new HttpError(410);
        const rest = log.filter((e) => e.seq > after);
        const sent = rest.slice(0, Math.min(limit, input.serverPageSize));
        pagesServed++;
        pagesThisSync++;
        return {
            changes: sent.map((e) => ({ id: e.id, version: e.version, deleted: e.deleted, data: e.data })),
            nextCursor: encode(sent.length ? sent[sent.length - 1].seq : after),
            hasMore: rest.length > sent.length,
        };
    },
};

let rows = new Map<string, { version: number; data: string | null }>((input.local?.rows ?? []).map((r) => [r.id, { version: r.version, data: r.data }]));
let saved: string | null = input.local ? encode(input.local.cursorSeq) : null;
let kill: { page: number; afterWrites: number } | null = null;

const store: Store = {
    cursor: () => saved,
    setCursor: (cursor) => { saved = cursor; },
    transaction(fn) {
        const draft = new Map(rows);
        let draftCursor = saved;
        let writes = 0;
        const write = () => {
            if (kill && pagesThisSync === kill.page && writes++ >= kill.afterWrites) throw new Killed("app killed");
        };
        fn({
            upsert: (id, version, data) => { write(); draft.set(id, { version, data }); },
            remove: (id) => { write(); draft.delete(id); },
            clear: () => { write(); draft.clear(); },
            setCursor: (cursor) => { write(); draftCursor = cursor; },
        });
        rows = draft;
        saved = draftCursor;
    },
};

let resyncs = 0;
let kills = 0;
const errors: string[] = [];
for (const step of input.steps) {
    if (step.server) {
        for (const c of step.server) log.push({ seq: log.length, id: c.id, version: c.version, deleted: c.deleted ?? false, data: c.deleted ? null : (c.data ?? `${c.id} v${c.version}`) });
    }
    if (step.expireBefore !== undefined) expireBefore = step.expireBefore;
    if (step.sync) {
        kill = step.killAt ?? null;
        pagesThisSync = 0;
        try {
            if (syncDeltas(api, store).resynced) resyncs++;
        } catch (error) {
            if (error instanceof Killed) kills++;
            else errors.push(error instanceof Error ? error.message : String(error));
        }
    }
}

console.log(JSON.stringify({
    rows: [...rows].map(([id, r]) => `${id}@${r.version}`).sort(),
    cursorAtEnd: saved !== null && decode(saved) === log.length - 1,
    pagesServed,
    resyncs,
    kills,
    errors,
}));
