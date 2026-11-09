import { describe, expect, it } from "vitest";

import { cloudinaryEntry, cloudinaryPublicId, duplicateNames, mediaKey, needsUpload, payloadEntry, resolveMediaTarget } from "../../content/tools/mediaTarget.mjs";

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

describe("manifest entries", () => {
    it("maps a Payload doc", () => {
        const doc = { url: "http://127.0.0.1:3010/api/media/file/a.svg", width: 10, height: 5, mimeType: "image/svg+xml", filesize: 99 };
        expect(payloadEntry({ key: "k", doc, mime: "image/svg+xml", checksum: "c" })).toEqual({
            key: "k", url: doc.url, width: 10, height: 5, format: "svg", bytes: 99, checksum: "c", provider: "payload", mime: "image/svg+xml",
        });
    });
    it("maps a Cloudinary video with duration and an image without", () => {
        const result = { public_id: "codedev/production/k", width: 1, height: 2, format: "mp4", bytes: 7, duration: 3.5 };
        expect(cloudinaryEntry({ key: "k", result, url: "u", mime: "video/mp4", checksum: "c", video: true })).toEqual({
            key: "k", publicId: result.public_id, url: "u", width: 1, height: 2, format: "mp4", bytes: 7, duration: 3.5, checksum: "c", provider: "cloudinary", mime: "video/mp4",
        });
        expect(cloudinaryEntry({ key: "k", result, url: "u", mime: "image/png", checksum: "c" })).not.toHaveProperty("duration");
    });
    it("finds a diagram and a video sharing a name", () => {
        expect(duplicateNames(["a.svg", "b.png"], ["b.mp4", "c.webm"])).toEqual([["b.png", "b.mp4"]]);
        expect(duplicateNames(["a.svg"], ["c.mp4"])).toEqual([]);
    });
});
