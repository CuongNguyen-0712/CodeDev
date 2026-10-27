import { readFileSync } from "node:fs";

// CodeDev sign-in sets two cookies: a short-lived access cookie sent to the whole API, and a
// long-lived refresh cookie sent only to the refresh route. On logout it sends two clearing cookies.
// The incident: the refresh cookie had Domain=codedev.test, so browsers sent it to every subdomain,
// including the learner preview apps on *.preview.codedev.test.
//
// buildAuthCookies(config, nowMs, accessToken, refreshToken) returns the exact Set-Cookie values.
//
// Secure: every cookie gets Secure, except when config.environment is "local-http" (a documented
// dev mode for plain http://, for example a phone testing http://192.168.1.20:3000): then no cookie
// gets Secure.
//
// Validation, checked in this order; the first failing rule returns { ok: false, error }:
//   1. "invalid ttl"                         accessTtlSeconds and refreshTtlSeconds are not both whole
//                                            numbers >= 1, or refreshTtlSeconds <= accessTtlSeconds
//   2. "invalid refresh path"                refreshPath does not match /^\/[A-Za-z0-9\/_-]+$/
//                                            (so "/" alone and paths with ";" or spaces are rejected)
//   3. "SameSite=None requires Secure"       sameSite is "None" and the cookies are not Secure
//   4. "cookie prefix requires Secure"       accessName or refreshName starts with "__Host-" or
//                                            "__Secure-" and the cookies are not Secure
//   5. "__Host- cookie must not have Domain" accessName or refreshName starts with "__Host-" and
//                                            domain is not null
//   6. "__Host- cookie requires Path=/"      refreshName starts with "__Host-" (the refresh cookie's
//                                            Path is the refresh route, never /)
//   7. "invalid token value"                 accessToken or refreshToken does not match /^[A-Za-z0-9._-]+$/
//
// Otherwise return { ok: true, login: [access, refresh], logout: [clearAccess, clearRefresh] }.
// Every header value is built in this exact attribute order, separated by "; ":
//   <name>=<value>; Max-Age=<seconds>; Expires=<date>[; Domain=<domain>]; Path=<path>[; Secure]; HttpOnly; SameSite=<value>
//   access cookie   name accessName,  value accessToken,  Max-Age accessTtlSeconds,  Path /,
//                   SameSite config.sameSite
//   refresh cookie  name refreshName, value refreshToken, Max-Age refreshTtlSeconds, Path refreshPath,
//                   SameSite Strict (always: only the app's own requests ever need it)
//   Expires         new Date(nowMs + ttlSeconds * 1000).toUTCString()  (nowMs is the fake clock)
//   Domain          only when config.domain is not null
//   clearing cookie same name, empty value, Max-Age=0, Expires=Thu, 01 Jan 1970 00:00:00 GMT, and the
//                   same Domain, Path, Secure, HttpOnly and SameSite as the cookie it clears
//
// Do not change the types or the test runner.

type CookieConfig = {
    environment: "production" | "local-http";
    domain: string | null; // null = host-only cookie (no Domain attribute)
    accessName: string; // "__Host-cd_at"
    refreshName: string; // "__Secure-cd_rt"
    refreshPath: string; // "/auth/refresh"
    sameSite: "Strict" | "Lax" | "None";
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
};

type AuthCookies = { ok: true; login: string[]; logout: string[] } | { ok: false; error: string };

const EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT";

function validate(c: CookieConfig, secure: boolean, accessToken: string, refreshToken: string): string | null {
    const ttlOk = (n: number) => Number.isInteger(n) && n >= 1;
    if (!ttlOk(c.accessTtlSeconds) || !ttlOk(c.refreshTtlSeconds) || c.refreshTtlSeconds <= c.accessTtlSeconds) {
        return "invalid ttl";
    }
    if (!/^\/[A-Za-z0-9\/_-]+$/.test(c.refreshPath)) return "invalid refresh path";
    if (c.sameSite === "None" && !secure) return "SameSite=None requires Secure";
    const names = [c.accessName, c.refreshName];
    const prefixed = (n: string) => n.startsWith("__Host-") || n.startsWith("__Secure-");
    if (!secure && names.some(prefixed)) return "cookie prefix requires Secure";
    if (c.domain !== null && names.some((n) => n.startsWith("__Host-"))) return "__Host- cookie must not have Domain";
    if (c.refreshName.startsWith("__Host-")) return "__Host- cookie requires Path=/";
    const valueOk = (v: string) => /^[A-Za-z0-9._-]+$/.test(v);
    if (!valueOk(accessToken) || !valueOk(refreshToken)) return "invalid token value";
    return null;
}

function buildAuthCookies(config: CookieConfig, nowMs: number, accessToken: string, refreshToken: string): AuthCookies {
    const secure = config.environment !== "local-http";
    const error = validate(config, secure, accessToken, refreshToken);
    if (error) return { ok: false, error };

    const header = (name: string, value: string, maxAge: number, expires: string, path: string, sameSite: string) =>
        [
            `${name}=${value}`,
            `Max-Age=${maxAge}`,
            `Expires=${expires}`,
            ...(config.domain !== null ? [`Domain=${config.domain}`] : []),
            `Path=${path}`,
            ...(secure ? ["Secure"] : []),
            "HttpOnly",
            `SameSite=${sameSite}`,
        ].join("; ");
    const at = (ttl: number) => new Date(nowMs + ttl * 1000).toUTCString();

    return {
        ok: true,
        login: [
            header(config.accessName, accessToken, config.accessTtlSeconds, at(config.accessTtlSeconds), "/", config.sameSite),
            header(config.refreshName, refreshToken, config.refreshTtlSeconds, at(config.refreshTtlSeconds), config.refreshPath, config.sameSite),
        ],
        logout: [
            header(config.accessName, "", 0, EPOCH, "/", config.sameSite),
            header(config.refreshName, "", 0, EPOCH, config.refreshPath, config.sameSite),
        ],
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: [{ config, nowMs, accessToken, refreshToken }] }. Output: one result per case.
type Case = { config: CookieConfig; nowMs: number; accessToken: string; refreshToken: string };

const { cases }: { cases: Case[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => buildAuthCookies(c.config, c.nowMs, c.accessToken, c.refreshToken))));
