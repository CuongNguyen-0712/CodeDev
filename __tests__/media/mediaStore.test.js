import { afterEach, describe, expect, it, vi } from "vitest";

import { mediaStore, destroyStoredFile } from "@/lib/media/mediaStore";
import { deleteFromPayload } from "@/lib/media/payloadMedia.mjs";

const destroyAsset = vi.fn(async () => "ok");
const uploadBuffer = vi.fn(async () => ({ public_id: "codedev/production/users/u1/avatars/x", secure_url: "https://c/x.png", width: 1, height: 1, format: "png", version: 1, bytes: 3 }));
const s3Delete = vi.fn(async () => {});
vi.mock("@/lib/cloudinary", async () => {
    const actual = await vi.importActual("@/lib/cloudinary");
    return { ...actual, destroyAsset: (...a) => destroyAsset(...a), uploadBuffer: (...a) => uploadBuffer(...a) };
});
vi.mock("@/lib/s3", () => ({ s3: { delete: (...a) => s3Delete(...a) } }));

const realFetch = global.fetch;
afterEach(() => {
    global.fetch = realFetch;
    vi.clearAllMocks();
});

const PAYLOAD_ENV = { APP_ENV: "development", PAYLOAD_URL: "http://127.0.0.1:3010", PAYLOAD_API_KEY: "k" };

describe("mediaStore", () => {
    it("picks Cloudinary only in production", () => {
        expect(mediaStore({ APP_ENV: "production" }).provider).toBe("cloudinary");
        for (const APP_ENV of ["development", "test", "staging"]) {
            expect(mediaStore({ APP_ENV }).provider).toBe("payload");
        }
    });

    it("uploads to Cloudinary with the avatar options", async () => {
        const out = await mediaStore({ APP_ENV: "production" }).upload(Buffer.from("abc"), {
            key: "users/u1/avatars/x", mime: "image/png", maxSide: 512, purpose: "avatar", allowedFormats: ["jpg", "png"],
        });
        expect(uploadBuffer.mock.calls[0][1]).toEqual({
            folder: "codedev/production/users/u1/avatars",
            public_id: "x",
            resource_type: "image",
            overwrite: false,
            tags: ["avatar"],
            context: { purpose: "avatar" },
            allowed_formats: ["jpg", "png"],
            transformation: [{ width: 512, height: 512, crop: "limit" }],
        });
        expect(out).toMatchObject({ provider: "cloudinary", objectKey: "codedev/production/users/u1/avatars/x" });
    });

    it("payload store is not configured without PAYLOAD_URL or key", () => {
        expect(mediaStore({ APP_ENV: "development" }).isConfigured()).toBe(false);
        expect(mediaStore({ APP_ENV: "development", PAYLOAD_URL: "http://x" }).isConfigured()).toBe(false);
        expect(mediaStore(PAYLOAD_ENV).isConfigured()).toBe(true);
    });

    it("uploads to Payload and maps the response", async () => {
        const calls = [];
        global.fetch = vi.fn(async (url, init) => {
            calls.push({ url: String(url), init });
            if (init?.method === "POST") {
                return new Response(JSON.stringify({ doc: { id: 42, url: "/api/media/file/x.png", width: 64, height: 64, mimeType: "image/png", filesize: 70 } }), { status: 201 });
            }
            return new Response(JSON.stringify({ docs: [] }), { status: 200 });
        });
        const result = await mediaStore(PAYLOAD_ENV).upload(Buffer.from("png"), {
            key: "users/u1/avatars/x", mime: "image/png", filename: "x.png", purpose: "avatar",
        });
        const post = calls.find((c) => c.init?.method === "POST");
        expect(post.url).toBe("http://127.0.0.1:3010/api/media");
        expect(post.init.headers.Authorization).toBe("users API-Key k");
        expect(post.init.body.get("_payload")).toContain('"key":"users/u1/avatars/x"');
        expect(result).toEqual({
            provider: "payload", objectKey: "42", url: "http://127.0.0.1:3010/api/media/file/x.png",
            width: 64, height: 64, format: "png", version: null, bytes: 70,
        });
    });

    it("replaces an existing doc with the same key", async () => {
        const methods = [];
        global.fetch = vi.fn(async (url, init = {}) => {
            methods.push(init.method || "GET");
            if (init.method === "POST") return new Response(JSON.stringify({ doc: { id: 2, url: "/a", mimeType: "image/png" } }), { status: 201 });
            if (init.method === "DELETE") return new Response("{}", { status: 200 });
            return new Response(JSON.stringify({ docs: [{ id: 1 }] }), { status: 200 });
        });
        await mediaStore(PAYLOAD_ENV).upload(Buffer.from("x"), { key: "k", mime: "image/png", filename: "a.png", purpose: "content" });
        expect(methods).toEqual(["GET", "DELETE", "POST"]);
    });
});

describe("deleteFromPayload", () => {
    const args = { baseUrl: "http://127.0.0.1:3010", apiKey: "k", id: "7" };
    it("treats a 404 on delete as not found", async () => {
        global.fetch = vi.fn(async () => new Response("{}", { status: 404 }));
        await expect(deleteFromPayload(args)).resolves.toBe("not found");
    });
    it("rejects on 500", async () => {
        global.fetch = vi.fn(async () => new Response("{}", { status: 500 }));
        await expect(deleteFromPayload(args)).rejects.toThrow();
    });
});

describe("destroyStoredFile", () => {
    it("dispatches by provider", async () => {
        await destroyStoredFile({ provider: "cloudinary", objectKey: "a" });
        expect(destroyAsset).toHaveBeenCalledWith("a");

        const prev = { ...process.env };
        Object.assign(process.env, { PAYLOAD_URL: "http://127.0.0.1:3010", PAYLOAD_API_KEY: "k" });
        global.fetch = vi.fn(async () => new Response("{}", { status: 200 }));
        try {
            await destroyStoredFile({ provider: "payload", objectKey: "7" });
        } finally {
            process.env.PAYLOAD_URL = prev.PAYLOAD_URL;
            process.env.PAYLOAD_API_KEY = prev.PAYLOAD_API_KEY;
            if (prev.PAYLOAD_URL === undefined) delete process.env.PAYLOAD_URL;
            if (prev.PAYLOAD_API_KEY === undefined) delete process.env.PAYLOAD_API_KEY;
        }
        expect(global.fetch.mock.calls[0][0]).toBe("http://127.0.0.1:3010/api/media/7");
        expect(global.fetch.mock.calls[0][1].method).toBe("DELETE");

        await destroyStoredFile({ provider: "s3", objectKey: "coding/x", bucket: "private" });
        expect(s3Delete).toHaveBeenCalledWith("coding/x", { bucket: "private" });
    });
});

describe("cloudinaryFolder", () => {
    it("always uses the production segment", async () => {
        const { cloudinaryFolder } = await import("@/lib/cloudinary");
        const prev = { a: process.env.APP_ENV, r: process.env.CLOUDINARY_ROOT_FOLDER };
        process.env.APP_ENV = "development";
        delete process.env.CLOUDINARY_ROOT_FOLDER;
        try {
            expect(cloudinaryFolder("users", "u1")).toBe("codedev/production/users/u1");
        } finally {
            if (prev.a === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = prev.a;
            if (prev.r !== undefined) process.env.CLOUDINARY_ROOT_FOLDER = prev.r;
        }
    });
});
