// Pure helpers shared by the k6 scripts and the vitest tests: no k6/* imports, plain ES module.

export const THRESHOLDS = { readP95: 800, writeP95: 1500, errorRate: 0.01, bottleneckFactor: 2 };
export const WEIGHTS = { guest: 0.3, learner: 0.5, social: 0.15, coder: 0.05 };
export const THINK_MS = [3000, 10000];
export const STAGE_MS = 120000;
export const STAGE_VUS = 50;

// A Next.js server action answers in the RSC format: line `0:` is the render stub, line `1:` the
// action result (`1:E{...}` is a thrown error and does not parse as JSON).
export function parseActionResponse(status, body) {
    const line = String(body ?? "").split("\n").find((l) => l.startsWith("1:"));
    let data;
    try {
        data = line ? JSON.parse(line.slice(2)) : undefined;
    } catch {
        data = undefined;
    }
    if (!data || typeof data !== "object") {
        return { ok: false, message: String(body ?? "").slice(0, 120) };
    }
    return { ok: status === 200 && data.success === true, data: data.data, status: data.status, message: data.message };
}

// `actionOk` is only passed for server actions; their failures arrive as HTTP 200.
export function classifyResponse(status, actionOk) {
    if (status === 429) return "limited";
    if (status === 0 || status >= 400 || actionOk === false) return "error";
    return "ok";
}

// 401, or a 200 that is really the sign-in page: Next's redirect markup in the body, or the
// final URL (when redirects were followed) landing on /auth.
export function needsRefresh(status, body, url = "") {
    if (status === 401) return true;
    if (status !== 200) return false;
    if (/^https?:\/\/[^/]+\/auth(\?|\/|$)/.test(url)) return true;
    return /NEXT_REDIRECT[^"\n]*\/auth|http-equiv="refresh"[^>]*url=\/auth/.test(String(body ?? ""));
}

export function pickJourney(r, weights) {
    const names = Object.keys(weights);
    let acc = 0;
    for (const name of names) {
        acc += weights[name];
        if (r < acc) return name;
    }
    return names[names.length - 1];
}

export function stageOf(elapsedMs, stageMs) {
    return Math.floor(elapsedMs / stageMs);
}

// Folds k6's `res.cookies` ({ name: [{ value, max_age }] }) into a plain { name: value } jar;
// an empty value or a negative max_age (Max-Age=0) clears the cookie, as when a chunked session
// cookie shrinks.
export function mergeCookies(jar, resCookies) {
    const next = { ...jar };
    for (const [name, list] of Object.entries(resCookies || {})) {
        const c = list[list.length - 1];
        if (!c || c.value === "" || c.max_age < 0) delete next[name];
        else next[name] = c.value;
    }
    return next;
}

export function cookieHeader(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// One session per VU: two VUs on one session would present the same refresh token twice, and the
// second rotation counts as reuse and revokes the session.
export function sessionIndex(vu, total) {
    if (!(vu >= 1 && vu <= total)) {
        throw new Error(`VU ${vu} has no session of its own (${total} minted): lower the VUs or mint more sessions`);
    }
    return vu - 1;
}
