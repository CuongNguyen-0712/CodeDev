import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const requireAuthSession = vi.fn();
vi.mock("@/lib/session", () => ({ getAuthSession, requireAuthSession }));

const { apiRoute, requirePublicId } = await import("@/lib/routeHandler");

const req = () => new Request("http://localhost/api/x");

describe("apiRoute", () => {
    beforeEach(() => {
        getAuthSession.mockReset();
        requireAuthSession.mockReset();
    });

    it("auth none: never reads the session and sends the given Cache-Control", async () => {
        const res = await apiRoute(({ userId }) => ({ userId }), { auth: "none", cacheControl: "public, s-maxage=600" })(req());
        expect(getAuthSession).not.toHaveBeenCalled();
        expect(requireAuthSession).not.toHaveBeenCalled();
        expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=600");
        expect(await res.json()).toEqual({ success: true, data: { userId: null } });
    });

    it("auth optional: guests get userId null, signed-in users their id, private by default", async () => {
        getAuthSession.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: "u1" } });
        const route = apiRoute(({ userId }) => userId, { auth: "optional", allowLocked: true });

        expect((await (await route(req())).json()).data).toBeNull();
        const res = await route(req());
        expect((await res.json()).data).toBe("u1");
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
        expect(getAuthSession).toHaveBeenCalledWith({ allowLocked: true });
    });

    it("auth required (default): errors become the standard error body", async () => {
        requireAuthSession.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));
        const res = await apiRoute(() => "never")(req());
        expect(res.status).toBe(401);
        expect(await res.json()).toMatchObject({ success: false, message: "Unauthorized" });
    });
});

describe("requirePublicId", () => {
    it("accepts slugs and ULIDs, rejects anything else with 400", () => {
        expect(requirePublicId("intro-to-python")).toBe("intro-to-python");
        expect(() => requirePublicId("a%2Fb")).toThrow(expect.objectContaining({ status: 400 }));
        expect(() => requirePublicId(null)).toThrow(expect.objectContaining({ status: 400 }));
    });
});
