import { describe, expect, it } from "vitest";

import { cloudinaryPublicId, mediaKey, needsUpload, resolveMediaTarget } from "../../content/tools/mediaTarget.mjs";

const cloudinary = { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" };
const payload = { PAYLOAD_URL: "http://127.0.0.1:3010", PAYLOAD_API_KEY: "key" };

describe("resolveMediaTarget", () => {
    it("production env targets Cloudinary and assets.json", () => {
        expect(resolveMediaTarget({ APP_ENV: "production", ...cloudinary })).toEqual({
            provider: "cloudinary",
            manifestName: "assets.json",
            courseManifestName: "course.json",
        });
    });

    it("production without CLOUDINARY_* throws", () => {
        expect(() => resolveMediaTarget({ APP_ENV: "production" })).toThrow(/CLOUDINARY/);
    });

    it("development targets Payload and assets.local.json", () => {
        expect(resolveMediaTarget({ APP_ENV: "development", ...payload })).toEqual({
            provider: "payload",
            manifestName: "assets.local.json",
            courseManifestName: "course.local.json",
        });
    });

    it("refuses a remote PAYLOAD_URL", () => {
        expect(() => resolveMediaTarget({ APP_ENV: "development", ...payload, PAYLOAD_URL: "https://cms.example.com" })).toThrow(/local CMS/);
    });

    it("refuses a non-production env without PAYLOAD_URL", () => {
        expect(() => resolveMediaTarget({ APP_ENV: "development", ...cloudinary })).toThrow(/PAYLOAD_URL/);
    });
});

describe("needsUpload", () => {
    it("skips unchanged files", () => {
        expect(needsUpload({ checksum: "a" }, "a", { remoteExists: true })).toBe(false);
    });
    it("uploads when there is no entry or the checksum differs", () => {
        expect(needsUpload(undefined, "a", { remoteExists: true })).toBe(true);
        expect(needsUpload({ checksum: "a" }, "b", { remoteExists: true })).toBe(true);
    });
    it("re-uploads when the remote document is missing", () => {
        expect(needsUpload({ checksum: "a" }, "a", { remoteExists: false })).toBe(true);
    });
});

describe("keys", () => {
    it("builds keys and public ids", () => {
        expect(mediaKey({ course: "c", lesson: "l", name: "d" })).toBe("courses/c/l/d");
        expect(mediaKey({ course: "c", name: "cover" })).toBe("courses/c/cover");
        expect(cloudinaryPublicId("courses/c/cover")).toBe("codedev/production/courses/c/cover");
    });
});
