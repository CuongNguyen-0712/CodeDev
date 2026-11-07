import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

/**
 * Beams server client (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 5): publish to
 * users in chunks of 1000, sign Beams Tokens, delete a user's devices. Never throws, never calls
 * Beams without credentials.
 */
const SECRET = "s".repeat(32);
const PUBLISH_URL = "https://inst.pushnotifications.pusher.com/publish_api/v1/instances/inst/publishes/users";

let beams;
const fetchMock = vi.fn();

beforeEach(async () => {
    vi.stubEnv("BEAMS_INSTANCE_ID", "inst");
    vi.stubEnv("BEAMS_SECRET_KEY", SECRET);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    beams = await import("@/lib/beams");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const bodyOf = (call) => JSON.parse(call[1].body);

describe("pushToUsers", () => {
    it("pushes one request per 1000 users", async () => {
        const ids = Array.from({ length: 2001 }, (_, i) => `P${i}`);
        expect(await beams.pushToUsers(ids, { title: "t", body: "b", link: "/x" })).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(PUBLISH_URL);
        expect(init.method).toBe("POST");
        expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
        expect(bodyOf(fetchMock.mock.calls[0]).users).toHaveLength(1000);
        expect(bodyOf(fetchMock.mock.calls[2]).users).toHaveLength(1);
    });

    it("sends the web notification payload", async () => {
        await beams.pushToUsers(["P1"], { title: "Course unlocked", body: "You now have access", link: "/course/c1" });
        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            users: ["P1"],
            web: {
                time_to_live: 86400,
                notification: {
                    title: "Course unlocked",
                    body: "You now have access",
                    deep_link: "http://localhost:3000/course/c1",
                    hide_notification_if_site_has_focus: true,
                },
            },
        });
    });

    it("deep_link falls back to /notifications", async () => {
        await beams.pushToUsers(["P1"], { title: "t", body: "b", link: null });
        expect(bodyOf(fetchMock.mock.calls[0]).web.notification.deep_link).toBe("http://localhost:3000/notifications");
    });

    it("drops empty and over-long ids", async () => {
        await beams.pushToUsers(["", "x".repeat(165), "P1"], { title: "t", body: "b" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(bodyOf(fetchMock.mock.calls[0]).users).toEqual(["P1"]);

        fetchMock.mockClear();
        expect(await beams.pushToUsers([""], { title: "t", body: "b" })).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns false and never throws on HTTP error or timeout", async () => {
        fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
        expect(await beams.pushToUsers(["P1"], { title: "t", body: "b" })).toBe(false);

        fetchMock.mockRejectedValueOnce(new DOMException("t", "TimeoutError"));
        expect(await beams.pushToUsers(["P1"], { title: "t", body: "b" })).toBe(false);

        expect(fetchMock.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)).toBe(true);
    });

    it("is a no-op without config", async () => {
        vi.stubEnv("BEAMS_SECRET_KEY", "");
        expect(beams.beamsConfigured()).toBe(false);
        expect(await beams.pushToUsers(["P1"], { title: "t", body: "b" })).toBe(false);
        expect(await beams.beamsToken("P1")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("beamsToken", () => {
    it("signs a Beams Token", async () => {
        const { token } = await beams.beamsToken("P1");
        const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
            algorithms: ["HS256"],
            issuer: "https://inst.pushnotifications.pusher.com",
            subject: "P1",
        });
        expect(payload.exp - payload.iat).toBe(86400);
    });
});

describe("deleteBeamsUser", () => {
    it("deletes a user by encoded id", async () => {
        expect(await beams.deleteBeamsUser("a b")).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://inst.pushnotifications.pusher.com/customer_api/v1/instances/inst/users/a%20b");
        expect(init.method).toBe("DELETE");
        expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);

        fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
        expect(await beams.deleteBeamsUser("a b")).toBe(false);
    });
});
