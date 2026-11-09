import { afterEach, describe, expect, it, vi } from "vitest";

/** Store failures during an avatar upload (no database needed: the upload fails before any write). */
const store = { error: null };
vi.mock("@/lib/media/mediaStore", () => ({
    mediaStore: () => ({
        provider: "payload",
        isConfigured: () => true,
        upload: async () => { throw store.error; },
        destroy: async () => "ok",
    }),
    destroyStoredFile: async () => {},
}));
vi.mock("@/db/media.db", () => ({ mediaDb: {} }));
vi.mock("@/lib/cacheKeys", () => ({ invalidateUserCache: async () => {} }));
vi.mock("@/lib/pusher", () => ({ publishToUser: async () => {} }));

const { mediaService } = await import("@/services/media.service");

// 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const upload = () => mediaService.uploadAvatar({ userId: "u1", file: new File([PNG], "me.png", { type: "image/png" }) });

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("avatar upload store errors", () => {
    it("answers 503 with the cms:up hint when the local CMS cannot be reached", async () => {
        vi.stubEnv("APP_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        store.error = new TypeError("fetch failed");
        await expect(upload()).rejects.toMatchObject({ status: 503, message: "Image uploads are not available right now" });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("npm run cms:up"));
    });

    it("keeps 502 when the store answered with an error status", async () => {
        vi.stubEnv("APP_ENV", "development");
        vi.spyOn(console, "error").mockImplementation(() => {});
        store.error = Object.assign(new Error("Payload upload failed: 500"), { status: 500 });
        await expect(upload()).rejects.toMatchObject({ status: 502 });
    });

    it("keeps 502 for a network error in production", async () => {
        vi.stubEnv("APP_ENV", "production");
        vi.spyOn(console, "error").mockImplementation(() => {});
        store.error = new TypeError("fetch failed");
        await expect(upload()).rejects.toMatchObject({ status: 502 });
    });
});
