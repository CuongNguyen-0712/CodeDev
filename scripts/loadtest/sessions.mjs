// Mints sessions by really signing in the seeded users: node scripts/loadtest/sessions.mjs --env .env.loadtest --base http://localhost:3000 --count 20
// Local only: the per-user x-forwarded-for is trusted just because no trusted IP header is configured locally.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { cookieHeader, parseSetCookies } from "./http.mjs";
import { loadEnvFile } from "./target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { values: a } = parseArgs({
    options: { env: { type: "string" }, base: { type: "string" }, count: { type: "string" }, concurrency: { type: "string", default: "8" } },
});
if (!a.env || !a.base || !a.count) {
    console.error("usage: sessions.mjs --env <file> --base <url> --count <k> [--concurrency 8]");
    process.exit(1);
}
const password = loadEnvFile(a.env).LOADTEST_PASSWORD;
if (!password) {
    console.error("LOADTEST_PASSWORD missing in " + a.env);
    process.exit(1);
}
const users = JSON.parse(fs.readFileSync(path.join(root, "tests/loadtest/users.json"), "utf8")).slice(0, Number(a.count));
const setCookies = (res) => res.headers.getSetCookie();

async function login(user, i) {
    const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
    const headers = { "x-forwarded-for": ip };
    const csrfRes = await fetch(`${a.base}/api/auth/csrf`, { headers });
    const { csrfToken } = await csrfRes.json();
    const jar = parseSetCookies(setCookies(csrfRes));
    const res = await fetch(`${a.base}/api/auth/callback/credentials`, {
        method: "POST",
        redirect: "manual",
        headers: { ...headers, "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar) },
        body: new URLSearchParams({ csrfToken, username: user.username, password, json: "true" }),
    });
    Object.assign(jar, parseSetCookies(setCookies(res)));
    delete jar["next-auth.csrf-token"];
    if (!Object.keys(jar).some((k) => k.startsWith("next-auth.session-token")) || !jar.cd_refresh) {
        throw new Error(`${user.username}: login gave no session/refresh cookie (HTTP ${res.status})`);
    }
    return { ...user, ip, cookies: jar };
}

const out = new Array(users.length);
let next = 0;
let failed = null;
await Promise.all(
    Array.from({ length: Number(a.concurrency) }, async () => {
        while (!failed && next < users.length) {
            const i = next++;
            try {
                out[i] = await login(users[i], i + 1);
            } catch (e) {
                failed ??= e;
            }
        }
    }),
);
if (failed) {
    console.error(failed.message);
    process.exit(1);
}
fs.writeFileSync(path.join(root, "tests/loadtest/sessions.json"), JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} sessions to tests/loadtest/sessions.json`);
