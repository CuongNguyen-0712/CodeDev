import { readFileSync } from "node:fs";

// Spot the AI Mistake: a token cookie JavaScript can read. The request sent to an AI coding assistant was:
//   "Set the auth cookies after login so the frontend can show the user's name."
// The assistant wrote buildLoginResponse below and changed the SPA in the same pull request: the SPA
// stores body.accessToken in localStorage and sends it as a Bearer header. Login works, the header
// shows "Hi, <name>", refresh works, and the pull request was merged.
//
// The security review of POST https://api.codedev.test/auth/login lists what the response must do:
//   1. No token in the response body: the body is only { user: { id, displayName } }.
//   2. The access token travels in the cookie __Host-cd_at: hidden from scripts, Secure,
//      sent only to api.codedev.test (every path), SameSite=Lax, Max-Age 900 seconds.
//   3. The refresh token travels in the cookie __Secure-cd_rt: hidden from scripts, Secure,
//      sent only to https://api.codedev.test/auth/refresh, SameSite=Strict, Max-Age 1209600 seconds.
//   4. display_name is not sensitive: it stays readable by the SPA on app.codedev.test, with
//      Domain=codedev.test, Path=/, Secure, SameSite=Lax and the same Max-Age as the refresh token.
// Browsers reject a cookie that breaks the rules of its __Host- or __Secure- name prefix, and the
// browser in the test runner does too.
//
// Fix buildLoginResponse. Do not change the types, the constants, the SPA, the browser or the test runner.

type User = { id: string; displayName: string };
type Tokens = { accessToken: string; refreshToken: string };
type LoginResponse = { status: number; setCookie: string[]; body: unknown };

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 14 * 24 * 60 * 60;

/** POST https://api.codedev.test/auth/login, after the password check: what goes back to the browser. */
function buildLoginResponse(user: User, tokens: Tokens): LoginResponse {
    // Tokens only in HttpOnly cookies scoped to the API host; only the display name is readable by the SPA.
    return {
        status: 200,
        setCookie: [
            `__Host-cd_at=${tokens.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ACCESS_TTL_S}`,
            `__Secure-cd_rt=${tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=${REFRESH_TTL_S}`,
            `display_name=${encodeURIComponent(user.displayName)}; Domain=codedev.test; Path=/; Secure; SameSite=Lax; Max-Age=${REFRESH_TTL_S}`,
        ],
        body: { user: { id: user.id, displayName: user.displayName } },
    };
}
// ------------------------------------------------------------------ browser (do not change)
// A small cookie jar with the browser rules that matter here (RFC 6265 and the cookie prefixes):
// Domain must match the host and turns a host-only cookie into one sent to every subdomain; without
// Path the cookie gets the directory of the request path (/auth for /auth/login); __Secure- needs
// Secure; __Host- needs Secure, Path=/ and no Domain; SameSite=None needs Secure.
type Cookie = {
    name: string; value: string; hostOnly: boolean; domain: string; path: string;
    secure: boolean; httpOnly: boolean; sameSite: string; maxAge: number | null;
};

class Browser {
    jar: Cookie[] = [];
    localStorage = new Map<string, string>();
    rejected: string[] = [];

    receive(setCookie: string[], host: string, requestPath: string): void {
        for (const header of setCookie) {
            const reason = this.store(header, host, requestPath);
            if (reason) this.rejected.push(reason);
        }
    }

    private store(header: string, host: string, requestPath: string): string | null {
        const [first, ...attrs] = header.split(";");
        const eq = first.indexOf("=");
        const name = (eq < 0 ? "" : first.slice(0, eq)).trim();
        const value = first.slice(eq + 1).trim();
        if (!name) return `a cookie without a name: ${header.slice(0, 40)}`;
        const c: Cookie = { name, value, hostOnly: true, domain: host, path: "", secure: false, httpOnly: false, sameSite: "missing", maxAge: null };
        for (const attr of attrs) {
            const i = attr.indexOf("=");
            const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
            const val = i < 0 ? "" : attr.slice(i + 1).trim();
            if (key === "domain" && val) {
                c.domain = val.replace(/^\./, "").toLowerCase();
                c.hostOnly = false;
            } else if (key === "path") c.path = val;
            else if (key === "max-age" && /^-?\d+$/.test(val)) c.maxAge = Number(val);
            else if (key === "secure") c.secure = true;
            else if (key === "httponly") c.httpOnly = true;
            else if (key === "samesite") {
                const v = val.toLowerCase();
                c.sameSite = v === "strict" ? "Strict" : v === "lax" ? "Lax" : v === "none" ? "None" : "missing";
            }
        }
        if (!c.hostOnly && !(host === c.domain || host.endsWith(`.${c.domain}`))) return `${name}: Domain=${c.domain} does not match ${host}`;
        if (!c.hostOnly && !c.domain.includes(".")) return `${name}: Domain=${c.domain} is a public suffix`;
        if (!c.path.startsWith("/")) c.path = requestPath.slice(0, requestPath.lastIndexOf("/")) || "/";
        if (name.startsWith("__Secure-") && !c.secure) return `${name}: __Secure- needs Secure`;
        if (name.startsWith("__Host-") && (!c.secure || !c.hostOnly || c.path !== "/")) return `${name}: __Host- needs Secure, Path=/ and no Domain`;
        if (c.sameSite === "None" && !c.secure) return `${name}: SameSite=None needs Secure`;
        this.jar = this.jar.filter((o) => !(o.name === c.name && o.domain === c.domain && o.path === c.path));
        if (c.maxAge !== null && c.maxAge <= 0) return null;
        this.jar.push(c);
        return null;
    }

    /** Cookies a same-site HTTPS request to host + path carries. */
    cookiesFor(host: string, path: string): Cookie[] {
        return this.jar.filter((c) => {
            const domainOk = c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`);
            const pathOk = path === c.path || (path.startsWith(c.path) && (c.path.endsWith("/") || path[c.path.length] === "/"));
            return domainOk && pathOk;
        });
    }

    /** What document.cookie returns to a script on https://<host>/. */
    documentCookie(host: string): string {
        return this.cookiesFor(host, "/").filter((c) => !c.httpOnly).map((c) => `${c.name}=${c.value}`).join("; ");
    }
}

// ------------------------------------------------- the SPA on https://app.codedev.test (do not change)
function spaAfterLogin(b: Browser, body: unknown): void {
    const token = (body as { accessToken?: unknown } | null)?.accessToken;
    if (typeof token === "string") b.localStorage.set("access_token", token);
}

function spaGreeting(b: Browser): string {
    const pair = b.documentCookie("app.codedev.test").split("; ").find((c) => c.startsWith("display_name="));
    let name = "";
    try {
        name = pair ? decodeURIComponent(pair.slice("display_name=".length)) : "";
    } catch {
        name = "";
    }
    return `Hi, ${name || "there"}`;
}

/** fetch(url, { credentials: "include" }) from the SPA, answered by a fake API that accepts the
 *  access token as a Bearer header or in any cookie, and the refresh token in any cookie. */
function spaFetch(b: Browser, tokens: Tokens, host: string, path: string): { status: number; cookies: string[] } {
    const sent = b.cookiesFor(host, path);
    const bearer = b.localStorage.get("access_token") ?? null;
    const hasCookie = (token: string) => sent.some((c) => c.value === token);
    let status = 404;
    if (host === "api.codedev.test" && path === "/auth/refresh") status = hasCookie(tokens.refreshToken) ? 200 : 401;
    else if (host === "api.codedev.test") status = bearer === tokens.accessToken || hasCookie(tokens.accessToken) ? 200 : 401;
    return { status, cookies: sent.map((c) => c.name).sort() };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "sessions": [{ "user": { id, displayName }, "tokens": { accessToken, refreshToken } }], "probes": [...] }
// Each session signs in with a fresh browser, then runs the probes:
//   "me"      GET https://api.codedev.test/me from the SPA
//   "refresh" POST https://api.codedev.test/auth/refresh from the SPA
//   "cookies" every cookie the browser stored and its attributes
//   "script"  what any script on app.codedev.test can read (document.cookie, localStorage)
//   "body"    the JSON body of the login response
//   "forum"   the cookies sent to https://forum.codedev.test/
//   "paths"   the cookies sent to https://api.codedev.test/courses/42
type Session = { user: User; tokens: Tokens };

function main(): void {
    const input: { sessions: Session[]; probes: string[] } = JSON.parse(readFileSync(0, "utf8"));
    const out: string[] = [];
    for (const { user, tokens } of input.sessions) {
        const b = new Browser();
        const res = buildLoginResponse(user, tokens);
        b.receive(res.setCookie, "api.codedev.test", "/auth/login");
        spaAfterLogin(b, res.body);
        const say = (line: string) => out.push(`${user.id} ${line}`);
        say(`login: ${res.status}, SPA shows "${spaGreeting(b)}"`);
        for (const reason of b.rejected) say(`browser rejected ${reason}`);
        const exposed = (texts: string[]) => {
            const found: string[] = [];
            if (texts.some((t) => t.includes(tokens.accessToken))) found.push("access token");
            if (texts.some((t) => t.includes(tokens.refreshToken))) found.push("refresh token");
            return found.join(" and ") || "none";
        };
        for (const probe of input.probes) {
            if (probe === "me") {
                say(`GET /me: ${spaFetch(b, tokens, "api.codedev.test", "/me").status}`);
            } else if (probe === "refresh") {
                say(`POST /auth/refresh: ${spaFetch(b, tokens, "api.codedev.test", "/auth/refresh").status}`);
            } else if (probe === "cookies") {
                for (const c of [...b.jar].sort((x, y) => (x.name < y.name ? -1 : 1))) {
                    const scope = c.hostOnly ? `host-only ${c.domain}` : `Domain=${c.domain}`;
                    say(`cookie ${c.name}: ${c.httpOnly ? "HttpOnly" : "readable by scripts"}, ${c.secure ? "Secure" : "not Secure"}, SameSite ${c.sameSite}, ${scope}, Path=${c.path}, Max-Age=${c.maxAge ?? "session"}`);
                }
            } else if (probe === "script") {
                const cookieText = b.documentCookie("app.codedev.test");
                const names = cookieText ? cookieText.split("; ").map((p) => p.split("=")[0]) : [];
                const stored = [...b.localStorage.entries()].map(([k, v]) => `${k}=${v}`);
                say(`script on app.codedev.test: cookies [${names.join(", ")}], localStorage [${[...b.localStorage.keys()].join(", ")}], tokens exposed: ${exposed([cookieText, ...stored])}`);
            } else if (probe === "body") {
                const shown = (res.body as { user?: { displayName?: unknown } } | null)?.user?.displayName;
                say(`login body: user ${typeof shown === "string" ? shown : "(missing)"}, tokens in body: ${exposed([JSON.stringify(res.body ?? null)])}`);
            } else if (probe === "forum") {
                const sent = b.cookiesFor("forum.codedev.test", "/");
                say(`forum.codedev.test receives: [${sent.map((c) => c.name).sort().join(", ")}], tokens exposed: ${exposed(sent.map((c) => c.value))}`);
            } else if (probe === "paths") {
                say(`GET /courses/42 carries: [${spaFetch(b, tokens, "api.codedev.test", "/courses/42").cookies.join(", ")}]`);
            }
        }
    }
    console.log(out.join("\n"));
}
main();
