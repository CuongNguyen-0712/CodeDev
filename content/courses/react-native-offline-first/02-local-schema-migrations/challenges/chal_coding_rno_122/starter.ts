import { readFileSync } from "node:fs";

// Rice Rocket courier app: the local SQLite database is upgraded on app start, before any screen
// reads it. The version lives in the database itself (PRAGMA user_version, 0 on a fresh install).
// In the app `db` wraps expo-sqlite; here it is a small stand-in with the same rules:
//   db.userVersion()                 the version stored in the database file
//   db.transaction(fn)               runs fn(tx) atomically: all of it is on disk, or none of it
//                                    (a thrown error or a killed app rolls the whole block back)
//   db.setUserVersion(v)             outside a transaction: written to disk at once
//   tx.createTable(name, columns)    tx.addColumn(table, column, { notNull?, default? })
//   tx.createIndex(name, table, columns)   tx.setUserVersion(v)
interface Column { notNull?: boolean; default?: string | number }
interface Tx {
    createTable(name: string, columns: string[]): void;
    addColumn(table: string, column: string, options: Column): void;
    createIndex(name: string, table: string, columns: string[]): void;
    setUserVersion(version: number): void;
}
interface Db { userVersion(): number; setUserVersion(version: number): void; transaction(fn: (tx: Tx) => void): void }
interface Migration { version: number; up(tx: Tx): void }

/** Brings the database to `appVersion`, the schema version this build of the app expects. */
function migrate(db: Db, appVersion: number): number {
    const current = db.userVersion();
    // [ ] Stop if the database is newer than this build
    // [ ] The migrations this database has not run yet
    for (const m of pending) {
        // [ ] Run one migration and record it, all or nothing
    }
    return db.userVersion();
}

const MIGRATIONS: Migration[] = [
    { version: 1, up: (tx) => tx.createTable("deliveries", ["id", "address", "status"]) },
    { version: 2, up: (tx) => tx.createTable("outbox", ["id", "kind", "payload", "attempts"]) },
    // [ ] v3: cash to collect on each delivery, 0 for existing rows
    { version: 4, up: (tx) => tx.createIndex("idx_deliveries_status", "deliveries", ["status"]) },
];

// ---------------------------------------------------------------- test runner (do not change)
// A stand-in for SQLite: committed state is what is "on disk"; a transaction works on a copy and
// replaces the committed state only when its block returns. Error texts follow SQLite's.
type Row = Record<string, string | number | null>;
interface State { userVersion: number; tables: Record<string, { columns: string[]; rows: Row[] }>; indexes: string[] }
class Killed extends Error {}

class FakeDb implements Db {
    statements = 0;
    constructor(public disk: State, private killAt: number | null) {}
    private tick(): void {
        this.statements++;
        if (this.killAt !== null && this.statements === this.killAt) throw new Killed("app killed");
    }
    userVersion(): number { return this.disk.userVersion; }
    setUserVersion(version: number): void { this.tick(); this.disk = { ...clone(this.disk), userVersion: version }; }
    transaction(fn: (tx: Tx) => void): void {
        const work = clone(this.disk);
        const tx: Tx = {
            createTable: (name, columns) => {
                this.tick();
                if (work.tables[name]) throw new Error(`table ${name} already exists`);
                work.tables[name] = { columns: [...columns], rows: [] };
            },
            addColumn: (table, column, options) => {
                this.tick();
                const t = work.tables[table];
                if (!t) throw new Error(`no such table: ${table}`);
                if (t.columns.includes(column)) throw new Error(`duplicate column name: ${column}`);
                if (options.notNull && options.default === undefined) throw new Error("Cannot add a NOT NULL column with default value NULL");
                t.columns.push(column);
                for (const row of t.rows) row[column] = options.default ?? null;
            },
            createIndex: (name, table, columns) => {
                this.tick();
                if (work.indexes.includes(name)) throw new Error(`index ${name} already exists`);
                if (!work.tables[table] || columns.some((c) => !work.tables[table].columns.includes(c))) throw new Error(`no such column in ${table}`);
                work.indexes.push(name);
            },
            setUserVersion: (version) => { this.tick(); work.userVersion = version; },
        };
        fn(tx);
        this.disk = work; // the block returned: commit
    }
}

const clone = (s: State): State => JSON.parse(JSON.stringify(s)) as State;

function snapshot(version: number, rows: number): State {
    const deliveries = { columns: ["id", "address", "status"], rows: [] as Row[] };
    for (let i = 1; i <= rows; i++) deliveries.rows.push({ id: `d${i}`, address: `${i} Nguyen Hue, District 1`, status: "assigned" });
    const s: State = { userVersion: version, tables: {}, indexes: [] };
    if (version >= 1) s.tables.deliveries = deliveries;
    if (version >= 2) s.tables.outbox = { columns: ["id", "kind", "payload", "attempts"], rows: [] };
    if (version >= 3) { deliveries.columns.push("cod_amount"); for (const r of deliveries.rows) r.cod_amount = 0; }
    if (version >= 4) s.indexes.push("idx_deliveries_status");
    if (version >= 5) s.tables.proofs = { columns: ["delivery_id", "photo_uri"], rows: [] };
    return s;
}

interface Case { from: number; rows?: number; appVersion: number; killAtStatement?: number; launches?: number }
const input = JSON.parse(readFileSync(0, "utf8")) as Case;
let disk = snapshot(input.from, input.rows ?? 0);
const launches: string[] = [];
for (let launch = 0; launch < (input.launches ?? 1) + (input.killAtStatement ? 1 : 0); launch++) {
    const db = new FakeDb(disk, launch === 0 ? input.killAtStatement ?? null : null);
    try {
        launches.push(`ok v${migrate(db, input.appVersion)}`);
    } catch (e) {
        launches.push(e instanceof Killed ? `killed at v${db.disk.userVersion}` : `error: ${(e as Error).message}`);
    }
    disk = db.disk;
}
const d = disk.tables.deliveries;
console.log(JSON.stringify({
    launches,
    userVersion: disk.userVersion,
    tables: Object.fromEntries(Object.entries(disk.tables).map(([k, t]) => [k, t.columns])),
    indexes: disk.indexes,
    codAmounts: d && d.columns.includes("cod_amount") ? d.rows.map((r) => r.cod_amount) : null,
}));
