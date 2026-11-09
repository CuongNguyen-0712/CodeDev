// Pure helpers for scripts/cloudinary-cleanup.mjs: no I/O, node builtins only.
const DEV_PREFIXES = ["codedev/development/", "codedev/test/"];
export const SOURCES = ["manifests", "covers", "dbKeys", "dbCovers", "sanity"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export const devAssets = (assets) => assets.filter((a) => DEV_PREFIXES.some((p) => a.publicId.startsWith(p)));

// Public id from a Cloudinary delivery URL; null for anything else.
export function coverPublicId(url) {
    if (typeof url !== "string") return null;
    let u;
    try {
        u = new URL(url);
    } catch {
        return null;
    }
    if (u.hostname !== "res.cloudinary.com") return null;
    const m = u.pathname.match(/^\/[^/]+\/(?:image|video|raw)\/upload\/(.+)$/);
    if (!m) return null;
    let segs = m[1].split("/");
    const v = segs.findIndex((s) => /^v\d+$/.test(s));
    // shortcut: without a version segment, transformation segments are told apart by the `x_` / `x_a,y_b` shape.
    segs = v >= 0 ? segs.slice(v + 1) : segs.filter((s, i, all) => i === all.length - 1 || !/^[a-z]{1,3}_[^/]*$/.test(s));
    const last = segs.length - 1;
    if (last < 0) return null;
    segs[last] = segs[last].replace(/\.[A-Za-z0-9]+$/, "");
    return decodeURIComponent(segs.join("/")) || null;
}

export function findOrphans({ assets, referenced }) {
    for (const name of SOURCES) if (!referenced?.[name]) throw new Error(`reference source missing: ${name}`);
    const refs = SOURCES.map((n) => referenced[n]);
    const keep = [];
    const orphans = [];
    for (const a of assets) {
        // Anything outside codedev/ is never ours to delete.
        if (!a.publicId.startsWith("codedev/") || refs.some((s) => s.has(a.publicId))) keep.push(a);
        else orphans.push(a);
    }
    return { keep, orphans };
}

// True for a local database, by URL hostname or a host= query parameter (pg honours it). Unparseable counts as local.
const isLocalHost = (h) => {
    const x = h.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return x === "" || x.startsWith("/") || x.startsWith("%2f") || x === "localhost" || x === "::1" || x === "0.0.0.0" || /^127(\.\d+){0,3}$/.test(x);
};
export function isLocalDbUrl(url) {
    try {
        const u = new URL(url);
        return [u.hostname, u.searchParams.get("host")].filter((h) => h != null).some(isLocalHost);
    } catch {
        return true;
    }
}

// Guards for --scope orphans, checked before anything is listed. envValues are the parsed values of the --env file only.
export function checkOrphansEnv(envValues) {
    if (envValues?.APP_ENV !== "production") throw new Error("--env file must set APP_ENV=production");
    const url = envValues.DATABASE_URL_UNPOOLED || envValues.DATABASE_URL;
    if (!url) throw new Error("--env file has no DATABASE_URL");
    if (isLocalDbUrl(url)) throw new Error("refusing a local database as the production reference");
    return url;
}

export function checkOrphansPreconditions({ envValues, referenced, allowEmptyDb = false, allowEmptySanity = false, allowEmptyDbCovers = false }) {
    checkOrphansEnv(envValues);
    for (const name of SOURCES) if (!referenced?.[name]) throw new Error(`reference source missing: ${name}`);
    for (const name of ["manifests", "covers"]) if (!referenced[name].size) throw new Error(`reference source empty: ${name}`);
    if (!referenced.dbKeys.size && !allowEmptyDb) throw new Error("reference source empty: dbKeys (pass --allow-empty-db to accept)");
    if (!referenced.sanity.size && !allowEmptySanity) throw new Error("reference source empty: sanity (pass --allow-empty-sanity to accept)");
    if (!referenced.dbCovers.size && !allowEmptyDbCovers) throw new Error("reference source empty: dbCovers (pass --allow-empty-db-covers to accept)");
}
