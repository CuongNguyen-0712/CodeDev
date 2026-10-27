import { readFileSync } from "node:fs";

// Course studio: the "Suggest an outline" button. The coding agent first wrote the server route
// below, saw it answer 401 in the demo, removed the session check, and then moved the AI call into
// the browser with the key in a NEXT_PUBLIC_ variable "so the button works". The AI vendor now
// reports the key in use from addresses that are not CodeDev's, and anyone can open DevTools and
// copy it from the studio's JavaScript.
//
// Fix the CLIENT and SERVER sections so that the browser only calls POST /api/outline, the key is
// used on the server only, the route rejects anonymous callers and limits each user, and no string
// the browser can reach contains the key. Rules: see the challenge description.
// Do not change the environment, the runtime or the test runner.

// ======================================================= .env.local (do not change)
const ENV: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: "https://studio.codedev.test",
    NEXT_PUBLIC_AI_API_KEY: "sk-fake-4f9a1c7e2b8d6a0f93e1", // added by the agent
    AI_API_KEY: "sk-fake-4f9a1c7e2b8d6a0f93e1",
};
// Like Next.js: the build copies the value of every publicEnv.NEXT_PUBLIC_* that client code reads
// into the JavaScript sent to the browser. serverEnv exists only on the server.
const publicEnv: Record<string, string> = Object.fromEntries(Object.entries(ENV).filter(([k]) => k.startsWith("NEXT_PUBLIC_")));
const serverEnv: Record<string, string> = ENV;

type User = { id: string };
type SuggestResult = { ok: true; outline: string[] } | { ok: false; status: number; error: string };

// ======================================================= CLIENT: app/studio/outline.ts
// Everything inside `client` is bundled and shipped to every browser that opens the studio.
const client = {
    vendorKey: publicEnv.NEXT_PUBLIC_AI_API_KEY, // kept for later
    async suggestOutline(title: string): Promise<SuggestResult> {
        const res = await browserFetch("/api/outline", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title }),
        });
        const data = await res.json();
        if (res.status !== 200) return { ok: false, status: res.status, error: String(data.error) };
        return { ok: true, outline: data.outline };
    },
};

// ======================================================= SERVER: app/api/outline/route.ts
// Runs on the server only. req.user is the user of the session cookie (null when there is none).
type ServerRequest = { user: User | null; body: string };
type ServerResponse = { status: number; body: Record<string, unknown> };

const OUTLINES_PER_MINUTE = 5;
// shortcut: in-memory fixed window per process, move to Redis or the database with more than one server.
const usage = new Map<string, number>();

const server = {
    async postOutline(req: ServerRequest): Promise<ServerResponse> {
        if (!req.user) return { status: 401, body: { error: "unauthenticated" } };
        let title: unknown;
        try {
            title = JSON.parse(req.body).title;
        } catch {
            return { status: 400, body: { error: "invalid_title" } };
        }
        if (typeof title !== "string" || title.trim() === "" || title.trim().length > 120) {
            return { status: 400, body: { error: "invalid_title" } };
        }
        const bucket = `${req.user.id}:${Math.floor(clock.now / 60_000)}`;
        const used = usage.get(bucket) ?? 0;
        if (used >= OUTLINES_PER_MINUTE) return { status: 429, body: { error: "rate_limited" } };
        usage.set(bucket, used + 1);

        const res = await serverFetch("https://api.ai-vendor.test/v1/outline", {
            method: "POST",
            headers: { authorization: `Bearer ${serverEnv.AI_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ topic: title.trim(), sections: 3 }),
        });
        if (res.status !== 200) return { status: 502, body: { error: "upstream_error" } };
        const data = await res.json();
        return { status: 200, body: { outline: data.sections } };
    },
};

// ======================================================= runtime (do not change)
// A fake network. browserFetch is the browser's fetch: a same-origin path such as "/api/outline"
// carries the session cookie of the browser's user; any other URL leaves the site without it.
// serverFetch is fetch on the server. The fake AI vendor accepts only the key in AI_API_KEY.
type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FetchResponse = { status: number; json(): Promise<any> };

const SESSIONS = new Map<string, User>([
    ["sess_ana", { id: "u_ana" }],
    ["sess_binh", { id: "u_binh" }],
]);
const clock = { now: 0 };
const vendorCalls = { server: 0, browser: 0 };
let browserSession: string | null = null;
let browserLog: string[] = [];

function respond(status: number, body: unknown): FetchResponse {
    const text = JSON.stringify(body);
    return { status, json: async () => JSON.parse(text) };
}

function vendorOutline(init: FetchInit, from: "server" | "browser"): FetchResponse {
    vendorCalls[from]++;
    if (init.headers?.authorization !== `Bearer ${ENV.AI_API_KEY}`) return respond(401, { error: "invalid_api_key" });
    let topic: unknown;
    try {
        topic = JSON.parse(init.body ?? "").topic;
    } catch {
        return respond(400, { error: "invalid_request" });
    }
    if (typeof topic !== "string" || topic.trim() === "") return respond(400, { error: "invalid_topic" });
    return respond(200, { sections: [`Why ${topic} matters`, `${topic} step by step`, `Practice: ${topic}`] });
}

async function browserFetch(url: string, init: FetchInit = {}): Promise<FetchResponse> {
    const method = init.method ?? "GET";
    const carriesKey = [url, JSON.stringify(init.headers ?? {}), init.body ?? ""].some((s) => s.includes(ENV.AI_API_KEY));
    browserLog.push(`${method} ${url}${carriesKey ? " [carries the API key]" : ""}`);
    if (url === "https://api.ai-vendor.test/v1/outline" && method === "POST") return vendorOutline(init, "browser");
    if (url === "/api/outline" && method === "POST") {
        const user = SESSIONS.get(browserSession ?? "") ?? null;
        const res = await server.postOutline({ user, body: init.body ?? "" });
        return respond(res.status, res.body);
    }
    return respond(404, { error: "no_route" });
}

async function serverFetch(url: string, init: FetchInit = {}): Promise<FetchResponse> {
    if (url === "https://api.ai-vendor.test/v1/outline" && (init.method ?? "GET") === "POST") return vendorOutline(init, "server");
    return respond(404, { error: "no_route" });
}

// The bundle scanner: the text of the client code after the build inlined publicEnv.NEXT_PUBLIC_*.
function scanBundle(): string {
    const bundle = Object.entries(client as Record<string, unknown>)
        .map(([name, value]) => (typeof value === "function" ? value.toString() : `${name}: ${JSON.stringify(value)}`))
        .join("\n")
        .replace(/publicEnv\.(NEXT_PUBLIC_\w+)/g, (_, name: string) => JSON.stringify(publicEnv[name] ?? ""));
    const found: string[] = [];
    if (bundle.includes(ENV.AI_API_KEY)) found.push("the AI API key");
    if (/\b(serverEnv|ENV)\b/.test(bundle)) found.push("a reference to server-only env");
    return found.length ? `FOUND ${found.join(" and ")}` : "no secrets";
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps.
//   { "browser": "sess_ana" | null, "title": "SQL Joins" }  the studio in that user's browser clicks the button
//   { "curl": "sess_ana" | null, "body": "{\"title\":\"x\"}" }  someone calls POST /api/outline directly
//   { "advance": 60000 }                                      the clock moves forward (milliseconds)
//   { "scan": true }                                          print what the bundle scanner finds
type Step = { browser?: string | null; title?: string; curl?: string | null; body?: string; advance?: number; scan?: boolean };

function show(status: number, body: Record<string, unknown>): string {
    return status === 200 && Array.isArray(body.outline) ? `200 ${body.outline.join(" | ")}` : `${status} ${String(body.error)}`;
}

async function main(): Promise<void> {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    for (const [i, step] of steps.entries()) {
        const n = `#${i + 1}`;
        if ("browser" in step) {
            browserSession = step.browser ?? null;
            browserLog = [];
            const who = SESSIONS.get(browserSession ?? "")?.id ?? "anonymous";
            const r = await client.suggestOutline(step.title ?? "");
            const result = r.ok ? `200 ${r.outline.join(" | ")}` : `${r.status} ${r.error}`;
            console.log(`${n} browser of ${who}: ${result}; requests: ${browserLog.join(", ") || "none"}`);
        } else if ("curl" in step) {
            const user = SESSIONS.get(step.curl ?? "") ?? null;
            const res = await server.postOutline({ user, body: step.body ?? "" });
            console.log(`${n} curl as ${user ? user.id : "anonymous"}: ${show(res.status, res.body)}`);
        } else if (step.advance !== undefined) {
            clock.now += step.advance;
            console.log(`${n} clock +${step.advance / 1000}s`);
        } else if (step.scan) {
            console.log(`${n} bundle scan: ${scanBundle()}`);
        }
    }
    console.log(`AI vendor calls: from the server ${vendorCalls.server}, from browsers ${vendorCalls.browser}`);
}
main();
