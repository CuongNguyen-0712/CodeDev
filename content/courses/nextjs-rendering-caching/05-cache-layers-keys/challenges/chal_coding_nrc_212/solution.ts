import { readFileSync } from "node:fs";

// CodeDev cache keys: one key per distinct response, and never one learner's data under another's key.
//
// cacheKey(req) returns the key as a string, null when the response must not be cached, or throws.
//
// 1. Look up req.resource in RESOURCES. Not there: throw new Error(`unknown resource "<resource>"`).
// 2. Every name in the resource's params list must be in req.params with a non-empty value, checked in
//    order of name; the first one missing: throw new Error(`missing param "<name>"`).
// 3. A "user" resource with no userId (null or "") returns null: personal data of an unknown user is
//    not cached at all.
// 4. Otherwise the key is five parts joined with "|":
//      <resource>|<locale>|<who>|<params>|<query>
//    - locale: encodeURIComponent(req.locale)
//    - who: "public" for a public resource (the user id is never in a public key, even when the
//      visitor is signed in); "user=" + encodeURIComponent(userId) for a user resource
//    - params: the resource's params, sorted by name, as name=value joined with "&"
//    - query: only the names in the resource's query list (tracking parameters such as utm_source,
//      fbclid or gclid are in no list), sorted by name. A value may be a string or an array of strings:
//      drop empty strings, remove duplicates, sort the values, and write one name=value per value.
//      A name with no values left is left out. Pairs joined with "&".
//    Every name and value is written with encodeURIComponent, so "&", "=" and "|" inside a value
//    cannot be mistaken for separators. Empty params or query parts stay empty ("a|en|public||").
// Do not change CacheRequest, RESOURCES or the test runner.

type CacheRequest = {
    resource: string;
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    userId: string | null;
    locale: string;
};

type Scope = "public" | "user";

const RESOURCES: Record<string, { scope: Scope; params: string[]; query: string[] }> = {
    "courses:list": { scope: "public", params: [], query: ["search", "level", "sort", "page"] },
    "courses:detail": { scope: "public", params: ["slug"], query: [] },
    "leaderboard": { scope: "public", params: [], query: ["period", "page"] },
    "progress": { scope: "user", params: ["slug"], query: [] },
    "dashboard": { scope: "user", params: [], query: ["tab"] },
};

const enc = encodeURIComponent;

function cacheKey(req: CacheRequest): string | null {
    if (!Object.prototype.hasOwnProperty.call(RESOURCES, req.resource)) {
        throw new Error(`unknown resource "${req.resource}"`);
    }
    const def = RESOURCES[req.resource];

    const paramNames = [...def.params].sort();
    for (const name of paramNames) {
        if (!req.params[name]) throw new Error(`missing param "${name}"`);
    }

    let who = "public";
    if (def.scope === "user") {
        if (!req.userId) return null;
        who = `user=${enc(req.userId)}`;
    }

    const params = paramNames.map((name) => `${enc(name)}=${enc(req.params[name])}`).join("&");

    const pairs: string[] = [];
    for (const name of [...def.query].sort()) {
        const raw = req.query[name];
        const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
        const values = [...new Set(list.filter((v) => v !== ""))].sort();
        for (const v of values) pairs.push(`${enc(name)}=${enc(v)}`);
    }

    return [req.resource, enc(req.locale), who, params, pairs.join("&")].join("|");
}

// ---------------------------------------------------------------- test runner (do not change)
const requests: CacheRequest[] = JSON.parse(readFileSync(0, "utf8"));
for (const r of requests) {
    try {
        const key = cacheKey(r);
        console.log(key === null ? "no-cache" : key);
    } catch (e) {
        console.log(`error: ${(e as Error).message}`);
    }
}
