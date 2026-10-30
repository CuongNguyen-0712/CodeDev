import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

// CodeDev API (https://api.codedev.test), login and CSRF handling - FIXED version.
// The learner web app is https://app.codedev.test; it keeps the access token in memory and sends
// it as Authorization: Bearer. The refresh token lives only in an HttpOnly cookie.

const ALLOWED_ORIGINS = ["https://app.codedev.test"];
const REFRESH_MAX_AGE = 2592000; // 30 days

type LoginResult = {
    userId: number;
    accessToken: string;
    expiresIn: number; // seconds
    refreshToken: string;
    csrfToken: string;
};

type HttpResponse = { status: number; setCookies: string[]; body: Record<string, unknown> };

// Header names are lower-case. "cookie" is the raw Cookie header ("a=1; b=2").
type IncomingRequest = { method: string; path: string; headers: Record<string, string> };

type CsrfDecision =
    | { ok: true }
    | { ok: false; reason: "origin_missing" | "origin_not_allowed" | "csrf_token_missing" | "csrf_token_mismatch" };

function parseCookies(header: string | undefined): Map<string, string> {
    const cookies = new Map<string, string>();
    for (const part of (header ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0) cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
    return cookies;
}

function loginResponse(r: LoginResult): HttpResponse {
    return {
        status: 200,
        setCookies: [
            // host-only (no Domain), sent only to /v1/auth/*, never readable by page scripts
            `__Secure-cd_refresh=${r.refreshToken}; Max-Age=${REFRESH_MAX_AGE}; Path=/v1/auth; Secure; HttpOnly; SameSite=Strict`,
            `__Host-cd_csrf=${r.csrfToken}; Max-Age=${REFRESH_MAX_AGE}; Path=/; Secure; SameSite=Strict`,
        ],
        // the refresh token stays out of the body: nothing for page scripts to store or steal
        body: { userId: r.userId, accessToken: r.accessToken, tokenType: "Bearer", expiresIn: r.expiresIn, csrfToken: r.csrfToken },
    };
}

function csrfCheck(req: IncomingRequest): CsrfDecision {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return { ok: true };
    if (!req.headers["cookie"]) return { ok: true }; // no ambient credential to ride on

    const origin = req.headers["origin"];
    if (origin === undefined) return { ok: false, reason: "origin_missing" };
    if (!ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return { ok: false, reason: "origin_not_allowed" };

    const sent = req.headers["x-csrf-token"] ?? "";
    const expected = parseCookies(req.headers["cookie"]).get("__Host-cd_csrf") ?? "";
    if (sent === "" || expected === "") return { ok: false, reason: "csrf_token_missing" };
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "csrf_token_mismatch" };
    return { ok: true };
}

// ---------------------------------------------------------------- test runner (do not change)
type TestInput = { view: "basic" | "body" | "full" | "refreshCookie" | "csrf"; login?: LoginResult; requests?: IncomingRequest[] };
const input: TestInput = JSON.parse(readFileSync(0, "utf8"));
if (input.view === "csrf") {
    console.log(JSON.stringify((input.requests ?? []).map(csrfCheck)));
} else {
    const login = input.login as LoginResult;
    const res = loginResponse(login);
    const refresh = res.setCookies.find((h) => h.split(";")[0].split("=").slice(1).join("=") === login.refreshToken);
    if (input.view === "basic") {
        console.log(JSON.stringify({ status: res.status, accessToken: res.body["accessToken"], expiresIn: res.body["expiresIn"], refreshCookieSet: refresh !== undefined }));
    } else if (input.view === "body") {
        console.log(JSON.stringify(res.body));
    } else if (input.view === "full") {
        console.log(JSON.stringify({ status: res.status, setCookies: res.setCookies }));
    } else {
        const parts = (refresh ?? "").split(";").map((s) => s.trim());
        const attr = (n: string) => parts.find((p) => p.toLowerCase().startsWith(n.toLowerCase() + "="))?.split("=")[1] ?? null;
        const flag = (n: string) => parts.some((p) => p.toLowerCase() === n.toLowerCase());
        console.log(JSON.stringify({ name: parts[0].split("=")[0], httpOnly: flag("HttpOnly"), secure: flag("Secure"), sameSite: attr("SameSite"), path: attr("Path"), domain: attr("Domain") }));
    }
}
