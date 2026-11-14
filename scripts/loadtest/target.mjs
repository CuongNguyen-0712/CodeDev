import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dotenv = createRequire(path.join(root, "package.json"))("dotenv");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres-load"]);

export function loadEnvFile(file) {
    return dotenv.parse(fs.readFileSync(path.resolve(root, file)));
}

// host:port/db without credentials or the Neon "-pooler" suffix, so a pooled URL still matches its direct one.
function identity(url) {
    try {
        const u = new URL(url);
        return `${u.hostname.replace(/-pooler(?=\.)/, "")}:${u.port || "5432"}${u.pathname}`;
    } catch {
        return null;
    }
}

// True for a local host (not Neon etc.) with a loadtest* database name: the only place the seed may bootstrap data.
export const isLocalHost = (url) => LOCAL_HOSTS.has(new URL(url).hostname);
export const isLoadtestDb = (url) => new URL(url).pathname.slice(1).startsWith("loadtest");
export const isLocalLoadtest = (url) => isLocalHost(url) && isLoadtestDb(url);

// Throws unless the load scripts may write to `url`.
export function assertSafeTarget(url, { root: base = root, confirmed = false } = {}) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Refusing: the database URL is missing or not a valid URL");
    }
    const target = identity(url);
    for (const name of [".env.production", ".env.local"]) {
        const file = path.resolve(base, name);
        if (!fs.existsSync(file)) continue;
        const other = dotenv.parse(fs.readFileSync(file)).DATABASE_URL;
        if (other && identity(other) === target) {
            throw new Error(`Refusing: this is the DATABASE_URL of ${name}; load runs only write to loadtest* databases`);
        }
    }
    if (isLocalHost(url)) {
        if (!isLoadtestDb(url)) {
            throw new Error(`Refusing: local database "${parsed.pathname.slice(1)}" does not start with loadtest`);
        }
    } else if (!confirmed) {
        throw new Error(`Refusing: ${parsed.hostname} is not local; add --yes once you are sure it is a load-test target`);
    }
}
