import { readFileSync } from "node:fs";

// Stale Page or Data Leak? Since Monday's release, learners on app.codedev.test open their dashboard
// and sometimes see another learner's name and progress; anonymous visitors have seen a learner's
// dashboard too. After a minute or so it "fixes itself". The release cached the dashboard query on
// the server and added a Cache-Control header to the /api/dashboard route handler. Bypassing the CDN
// did not stop the leak.
//
// Fix getDashboard and the route handler so that every learner only ever gets their own dashboard,
// from the server cache and from the CDN, while:
//   - the dashboard query stays cached on the server for 60 seconds, one entry per learner
//     (it is the expensive query the release wanted to cache);
//   - /api/dashboard is sent with "Cache-Control: private, no-cache" (no shared cache may store it);
//   - the course list stays public: cached on the server and by the CDN, "public, max-age=0, s-maxage=300".
// Do not change the fake clock, the database, the data cache, the CDN or the test runner.

// ---------------------------------------------------------------- clock and database (do not change)
let now = 0; // seconds since the start of the test

type Dashboard = { name: string; lessonsDone: number; streak: number };
const PROGRESS: Record<string, Dashboard> = {
    u_lan: { name: "Lan", lessonsDone: 3, streak: 2 },
    u_minh: { name: "Minh", lessonsDone: 41, streak: 19 },
    u_an: { name: "An", lessonsDone: 12, streak: 5 },
    u_thu: { name: "Thu", lessonsDone: 7, streak: 1 },
};
const CATALOG: Record<string, string[]> = {
    react: ["React Basics", "Hooks in Depth"],
    sql: ["SQL Basics", "Joins in Practice"],
    node: ["Node Streams"],
};

const db = {
    queries: { dashboard: 0, courses: 0 },
    dashboardFor(userId: string): Dashboard {
        db.queries.dashboard++;
        return { ...(PROGRESS[userId] ?? { name: userId, lessonsDone: 0, streak: 0 }) };
    },
    listCourses(category: string): string[] {
        db.queries.courses++;
        return category === "all" ? Object.values(CATALOG).flat() : [...(CATALOG[category] ?? [])];
    },
};

// ---------------------------------------------------------------- server data cache (do not change)
// cached(key, ttlSeconds, load): returns the value stored under key while it is younger than ttlSeconds,
// otherwise calls load(), stores the result under key and returns it.
const dataCache = new Map<string, { value: unknown; storedAt: number }>();
function cached<T>(key: string, ttlSeconds: number, load: () => T): T {
    const entry = dataCache.get(key);
    if (entry && now - entry.storedAt < ttlSeconds) return entry.value as T;
    const value = load();
    dataCache.set(key, { value, storedAt: now });
    return value;
}

type Req = { path: string; userId: string | null }; // userId comes from the session cookie
type Res = { status: number; body: string; cacheControl: string };

// ---------------------------------------------------------------- data layer and route handlers
function getDashboard(userId: string): Dashboard {
    return cached("dashboard", 60, () => db.dashboardFor(userId));
}

function getCourses(category: string): string[] {
    return cached(`courses:${category}`, 300, () => db.listCourses(category));
}

function handle(req: Req): Res {
    const url = new URL(req.path, "https://app.codedev.test");
    if (url.pathname === "/api/dashboard") {
        if (!req.userId) return { status: 401, body: JSON.stringify({ error: "sign in" }), cacheControl: "private, no-store" };
        const dashboard = getDashboard(req.userId);
        return { status: 200, body: JSON.stringify(dashboard), cacheControl: "private, no-cache" };
    }
    if (url.pathname === "/api/courses") {
        const category = url.searchParams.get("category")?.trim().toLowerCase() || "all";
        return { status: 200, body: JSON.stringify(getCourses(category)), cacheControl: "public, max-age=0, s-maxage=300" };
    }
    return { status: 404, body: JSON.stringify({ error: "not found" }), cacheControl: "private, no-store" };
}

// ---------------------------------------------------------------- CDN (do not change)
// A shared cache in front of the app. Like most CDNs by default, it keys entries by path and query only:
// the session cookie is not part of the key. It stores a 200 response unless Cache-Control contains
// "private" or "no-store", for s-maxage seconds (or max-age when there is no s-maxage), and serves the
// stored response while its age is below that.
const cdnStore = new Map<string, { res: Res; storedAt: number; ttl: number }>();
function cdn(req: Req, bypass: boolean): { res: Res; status: "HIT" | "MISS" | "BYPASS" } {
    if (bypass) return { res: handle(req), status: "BYPASS" };
    const hit = cdnStore.get(req.path);
    if (hit && now - hit.storedAt < hit.ttl) return { res: hit.res, status: "HIT" };
    const res = handle(req);
    const directives = res.cacheControl.split(",").map((d) => d.trim().toLowerCase());
    const seconds = (name: string): number | undefined => {
        const found = directives.find((d) => d.startsWith(`${name}=`));
        return found === undefined ? undefined : Number(found.slice(name.length + 1));
    };
    const ttl = seconds("s-maxage") ?? seconds("max-age") ?? 0;
    const storable = res.status === 200 && !directives.includes("private") && !directives.includes("no-store") && ttl > 0;
    if (storable) cdnStore.set(req.path, { res, storedAt: now, ttl });
    return { res, status: "MISS" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "bypassCdn"?: boolean, "requests": [{ "at": seconds, "user": "u_lan" | null, "path": "/api/..." }, ...] }
// Prints one line per request, then the number of database queries.
const input: { bypassCdn?: boolean; requests: { at: number; user: string | null; path: string }[] } =
    JSON.parse(readFileSync(0, "utf8"));
for (const r of input.requests) {
    now = r.at;
    const { res, status } = cdn({ path: r.path, userId: r.user }, input.bypassCdn === true);
    console.log(`t=${r.at} ${r.user ?? "anonymous"} GET ${r.path} -> ${res.status} ${res.body} | cdn ${status} | ${res.cacheControl}`);
}
console.log(`db queries: dashboard=${db.queries.dashboard} courses=${db.queries.courses}`);
