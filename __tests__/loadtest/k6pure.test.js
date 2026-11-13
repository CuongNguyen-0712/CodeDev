import fs from "node:fs";
import { expect, it } from "vitest";
import {
    THRESHOLDS, STAGE_MS, STAGE_VUS, WEIGHTS,
    classifyResponse, cookieHeader, mergeCookies, needsRefresh, parseActionResponse, pickJourney, stageOf,
} from "@/loadtest/k6/lib/pure.js";

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const okFixture = fixture("action-ok.txt");
const missingFixture = fixture("action-missing.txt");

it("reads the action result and treats success:false as failure", () => {
    expect(parseActionResponse(200, okFixture).ok).toBe(true);
    expect(parseActionResponse(200, '0:{"a":"$@1"}\n1:{"success":false,"status":429,"message":"slow"}')).toMatchObject({
        ok: false, status: 429, message: "slow",
    });
    expect(parseActionResponse(404, missingFixture).ok).toBe(false);
    // The real status of an unknown action id.
    expect(parseActionResponse(409, missingFixture).ok).toBe(false);
    expect(parseActionResponse(200, '0:{"a":"$@1"}\n1:E{"digest":"1"}').ok).toBe(false);
});

it("keeps 429 apart from errors", () => {
    expect(classifyResponse(429)).toBe("limited");
    expect(classifyResponse(200, false)).toBe("error");
    expect(classifyResponse(0)).toBe("error");
    expect(classifyResponse(503)).toBe("error");
    expect(classifyResponse(404)).toBe("error");
    expect(classifyResponse(200, true)).toBe("ok");
});

it("asks for a refresh on 401 or a sign-in redirect only", () => {
    expect(needsRefresh(401, "")).toBe(true);
    expect(needsRefresh(403, "")).toBe(false);
    expect(needsRefresh(200, "<html>fine</html>")).toBe(false);
    expect(needsRefresh(200, "<html></html>", "http://app:3000/auth?callbackUrl=%2Fhome")).toBe(true);
    expect(needsRefresh(200, '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/auth?x=1"/>')).toBe(true);
});

it("picks journeys by weight and buckets stages", () => {
    expect(pickJourney(0.1, WEIGHTS)).toBe("guest");
    expect(pickJourney(0.79, WEIGHTS)).toBe("learner");
    expect(pickJourney(0.96, WEIGHTS)).toBe("coder");
    expect(stageOf(239_999, STAGE_MS)).toBe(1);
    expect([THRESHOLDS.readP95, STAGE_VUS]).toEqual([800, 50]);
});

it("keeps the newest cookie values and drops cleared ones", () => {
    const jar = mergeCookies(
        { s: "old", "s.0": "chunk", cd_refresh: "r0" },
        { s: [{ value: "new" }], "s.0": [{ value: "", max_age: -1 }], cd_refresh: [{ value: "r1" }] }
    );
    expect(jar).toEqual({ s: "new", cd_refresh: "r1" });
    expect(cookieHeader(jar)).toBe("s=new; cd_refresh=r1");
});
