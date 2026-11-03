import { existsDb } from "@/db/exists.db";

/**
 * Proxy-side check that a public detail page's id exists, so a missing one gets a real 404.
 * With Partial Prefetching the page's App Shell is sent before the page can call notFound(), which
 * locks in a 200 (Next.js docs, loading.js "Status codes": check the slug in Proxy instead).
 *
 * Answers are kept in memory per instance so the check stays a Map lookup for pages people visit:
 * found for `found` ms, missing for `missing` ms (a course published meanwhile shows up within that).
 * Profiles keep a short window because hiding a profile must take effect quickly.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE = 60_000;

const CHECKS = [
    {
        kind: "course",
        pattern: /^\/course\/([^/]+)\/?$/,
        found: 5 * MINUTE,
        missing: 30_000,
        exists: async (id) => (await existsDb.course(id)).rowCount > 0,
    },
    {
        kind: "roadmap",
        pattern: /^\/roadmap\/([^/]+)\/?$/,
        found: 5 * MINUTE,
        missing: 30_000,
        exists: async (id) => UUID.test(id) && (await existsDb.roadmap(id)).rowCount > 0,
    },
    {
        kind: "profile",
        pattern: /^\/profile\/([^/]+)\/?$/,
        found: MINUTE,
        missing: 30_000,
        exists: async (key) => key.length <= 255 && (await existsDb.publicProfile(key)).rowCount > 0,
    },
];

const MAX_ENTRIES = 5_000;
const answers = new Map(); // `${kind}:${id}` -> { found, until }

function remember(key, found, ttl) {
    if (answers.size >= MAX_ENTRIES) answers.delete(answers.keys().next().value);
    answers.set(key, { found, until: Date.now() + ttl });
}

function decode(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return null;
    }
}

/**
 * false when `pathname` is a public detail page whose id does not exist; true otherwise, including
 * paths this module does not check and lookups that fail (the page then decides, as before).
 */
export async function pageExists(pathname) {
    for (const check of CHECKS) {
        const match = pathname.match(check.pattern);
        if (!match) continue;

        const id = decode(match[1]);
        if (!id) return false;

        const key = `${check.kind}:${id}`;
        const cached = answers.get(key);
        if (cached && cached.until > Date.now()) return cached.found;

        try {
            const found = await check.exists(id);
            remember(key, found, found ? check.found : check.missing);
            return found;
        } catch (error) {
            console.error("[proxy] page existence check failed:", error?.message);
            return true;
        }
    }
    return true;
}
