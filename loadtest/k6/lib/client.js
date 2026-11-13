import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { ORIGIN } from "./config.js";
import {
    STAGE_MS, THINK_MS, classifyResponse, cookieHeader, mergeCookies, needsRefresh, parseActionResponse, stageOf,
} from "./pure.js";

const limited = new Counter("limited");
const errors = new Counter("errors");
const failedRequests = new Rate("failed_requests");

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const randomKey = () => Array.from({ length: 32 }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join("");

export function createClient({ baseUrl, session, actions, journey = "unknown", origin = ORIGIN }) {
    // The VU's own cookie jar: k6's host-scoped jar is bypassed (sessions were minted for another host).
    let jar = session ? { ...session.cookies } : {};
    // No URL global in k6.
    const forwardedHost = origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const ip = session?.ip || `10.9.${(__VU >> 8) & 255}.${__VU & 255}`;

    function send(method, path, body, { endpoint, cls, headers = {} }) {
        const tags = {
            endpoint, class: cls, journey: client.journey, stage: String(stageOf(exec.instance.currentTestRunDuration, STAGE_MS)),
        };
        const res = http.request(method, baseUrl + path, body, {
            headers: { "x-forwarded-for": ip, Cookie: cookieHeader(jar), ...headers },
            jar: new http.CookieJar(), // empty: k6 adds nothing to the Cookie header above
            tags,
            timeout: "30s",
        });
        jar = mergeCookies(jar, res.cookies);
        return { res, tags };
    }

    function record(tags, status, actionOk) {
        const cls = classifyResponse(status, actionOk);
        if (cls === "limited") limited.add(1, tags);
        if (cls === "error") errors.add(1, tags);
        failedRequests.add(cls === "error", tags);
    }

    // Refresh keeps the newest cookies: reusing an old refresh token would revoke the session.
    function refresh() {
        const key = randomKey();
        let out;
        for (let attempt = 0; attempt < 3; attempt++) {
            out = send("POST", "/api/auth/refresh", null, {
                endpoint: "auth_refresh", cls: "write", headers: { "Idempotency-Key": key, Origin: origin },
            });
            if (out.res.status !== 503) break;
            sleep(0.2); // same key on retry
        }
        record(out.tags, out.res.status, out.res.status === 200 ? undefined : false); // a failed refresh is an error
        return out.res.status === 200;
    }

    // Action failures come back as HTTP 200 with their own status in the payload.
    const effectiveStatus = (res, a) => (a && !a.ok && a.status ? a.status : res.status);

    // Sends once; when the session looks expired, refreshes and sends again once.
    function request(method, path, body, opts, parse) {
        let { res, tags } = send(method, path, body, opts);
        let a = parse && parse(res);
        let status = effectiveStatus(res, a);
        if (session && needsRefresh(status, res.body, res.url) && refresh()) {
            ({ res, tags } = send(method, path, body, opts));
            a = parse && parse(res);
            status = effectiveStatus(res, a);
        }
        record(tags, status, a ? a.ok : undefined);
        return a ? { res, action: a } : res;
    }

    const client = {
        journey,
        get: (path, endpoint) => request("GET", path, null, { endpoint, cls: "read" }),
        // args is the server action's argument list, e.g. [{ challengeId, answers }]; pagePath must be
        // a page of the worker that holds the action (see actions.json).
        action(name, pagePath, args, endpoint) {
            const def = actions[name];
            if (!def) throw new Error(`unknown action ${name}`);
            return request("POST", pagePath, JSON.stringify(args), {
                endpoint,
                cls: "write",
                headers: {
                    "Next-Action": def.id,
                    Accept: "text/x-component",
                    "Content-Type": "text/plain;charset=UTF-8",
                    Origin: origin,
                    // Next compares Origin with the host it was reached by; k6 reaches the app as app:3000.
                    "x-forwarded-host": forwardedHost,
                },
            }, (res) => parseActionResponse(res.status, res.body));
        },
        think: () => sleep(THINK_MS[0] / 1000 + Math.random() * (THINK_MS[1] - THINK_MS[0]) / 1000),
    };
    return client;
}
