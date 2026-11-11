import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
    signedUploadUrl: vi.fn(),
    signedReadUrl: vi.fn(),
    info: vi.fn(),
    del: vi.fn(),
}));
const s3mock = vi.hoisted(() => ({
    buckets: { chat: "codedev-chat-media" },
    s3: { presignPut: vi.fn(), presignGet: vi.fn(), head: vi.fn(), delete: vi.fn(), getDownloadUrl: vi.fn() },
}));
const cld = vi.hoisted(() => ({
    configured: vi.fn(() => true),
    destroyAsset: vi.fn(async () => "ok"),
    sdk: {
        utils: { api_sign_request: vi.fn(() => "sig123"), private_download_url: vi.fn(() => "https://api.cloudinary.com/dl") },
        api: { resource: vi.fn() },
    },
}));

vi.mock("@upstash/blob", () => ({ Bucket: { fromEnv: () => blob } }));
vi.mock("@/lib/s3.js", () => s3mock);
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
    ...(await importOriginal()),
    default: cld.sdk,
    isCloudinaryConfigured: () => cld.configured(),
    destroyAsset: (...args) => cld.destroyAsset(...args),
}));

import * as chatMedia from "@/lib/chatMedia.js";

const { storageFor, storageKeyFor, uploadTicket, inspect, readUrl, remove } = chatMedia;
const notFound = (extra) => Object.assign(new Error("nf"), extra);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("attachment storage adapter", () => {
    const CNV = "cnv_0123456789abcdefghijklmnop";
    const ATT = "att_0123456789abcdefghijklmnop";
    const cloudImage = { kind: "image", provider: "cloudinary", storageKey: `codedev/chat/${CNV}/${ATT}`, contentType: "image/png", size: 10, fileName: null, conversationId: CNV };
    const upstashFile = { kind: "file", provider: "upstash", storageKey: `chat/${CNV}/${ATT}.pdf`, contentType: "application/pdf", size: 10, fileName: "Report.pdf" };
    const s3File = { ...upstashFile, provider: "s3" };
    const s3Image = { kind: "image", provider: "s3", storageKey: `chat/${CNV}/${ATT}.png`, contentType: "image/png", size: 10, fileName: null };

    beforeEach(() => {
        cld.configured.mockReturnValue(true);
        vi.stubEnv("CLOUDINARY_ROOT_FOLDER", "codedev");
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "t");
    });

    it("routes new uploads by kind and env", () => {
        vi.stubEnv("APP_ENV", "production");
        expect([storageFor("image"), storageFor("file")]).toEqual(["cloudinary", "upstash"]);
        for (const APP_ENV of ["development", "test"]) {
            vi.stubEnv("APP_ENV", APP_ENV);
            expect([storageFor("image"), storageFor("file")]).toEqual(["s3", "s3"]);
        }
        const key = (extra) => storageKeyFor({ conversationId: CNV, attachmentId: ATT, ...extra });
        expect(key({ kind: "image", provider: "cloudinary", contentType: "image/png" })).toBe(`codedev/chat/${CNV}/${ATT}`);
        expect(key({ kind: "image", provider: "s3", contentType: "image/webp" })).toBe(`chat/${CNV}/${ATT}.webp`);
        expect(key({ kind: "file", provider: "upstash", fileName: "Notes.v2.MD" })).toBe(`chat/${CNV}/${ATT}.md`);
        expect(() => key({ kind: "file", provider: "s3", fileName: "evil.exe" })).toThrow();
        expect(() => key({ kind: "file", provider: "s3", fileName: "pdf" })).toThrow();
        expect(() => key({ kind: "image", provider: "s3", contentType: "image/gif" })).toThrow();
        expect(() => storageKeyFor({ kind: "image", provider: "s3", contentType: "image/png", conversationId: "../x", attachmentId: ATT })).toThrow();
        expect(() => storageKeyFor({ kind: "image", provider: "s3", contentType: "image/png", conversationId: CNV, attachmentId: "att_X" })).toThrow();
    });

    it("signs a Cloudinary upload without leaking the secret", async () => {
        vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
        vi.stubEnv("CLOUDINARY_API_KEY", "key123");
        vi.stubEnv("CLOUDINARY_API_SECRET", "s3cr3t-value");
        const ticket = await uploadTicket(cloudImage);
        const [params, secret] = cld.sdk.utils.api_sign_request.mock.calls[0];
        expect(secret).toBe("s3cr3t-value");
        // asset_folder is signed too, so the browser cannot file the asset elsewhere; the public id keeps the full path.
        expect(params).toEqual({
            public_id: cloudImage.storageKey, asset_folder: `codedev/chat/${CNV}`, timestamp: expect.any(Number), type: "authenticated",
            allowed_formats: "jpg,png,webp", overwrite: "false",
        });
        expect(Math.abs(params.timestamp - Date.now() / 1000)).toBeLessThan(5);
        expect(ticket).toEqual({
            method: "POST",
            url: "https://api.cloudinary.com/v1_1/demo/image/upload",
            fields: { ...params, api_key: "key123", signature: "sig123" },
        });
        expect(ticket.fields).not.toHaveProperty("folder");
        expect(JSON.stringify(ticket)).not.toContain("s3cr3t-value");
    });

    it("reads by the row's provider, not the env", async () => {
        vi.stubEnv("APP_ENV", "development");
        const before = Math.floor(Date.now() / 1000);
        expect(await readUrl({ ...cloudImage, contentType: "image/jpeg" })).toBe("https://api.cloudinary.com/dl");
        const [id, format, options] = cld.sdk.utils.private_download_url.mock.calls[0];
        expect([id, format]).toEqual([cloudImage.storageKey, "jpg"]);
        expect(options).toMatchObject({ type: "authenticated", resource_type: "image" });
        expect(options.expires_at - before).toBeGreaterThanOrEqual(300);
        expect(options.expires_at - before).toBeLessThanOrEqual(301);

        await remove(cloudImage);
        expect(cld.destroyAsset).toHaveBeenCalledWith(cloudImage.storageKey, { resourceType: "image", type: "authenticated" });

        s3mock.s3.presignGet.mockResolvedValue("https://m/get");
        expect(await readUrl(s3Image)).toBe("https://m/get");
        expect(s3mock.s3.presignGet).toHaveBeenCalledWith(s3Image.storageKey, { bucket: "codedev-chat-media", expiresIn: 300 });
        expect(blob.signedReadUrl).not.toHaveBeenCalled();
    });

    it("downloads files as attachments", async () => {
        blob.signedReadUrl.mockResolvedValue({ url: "https://r", expiresAt: new Date() });
        expect(await readUrl(upstashFile)).toBe("https://r");
        expect(blob.signedReadUrl).toHaveBeenCalledWith(upstashFile.storageKey, { downloadAs: "Report.pdf" });

        s3mock.s3.getDownloadUrl.mockResolvedValue("https://m/dl");
        expect(await readUrl(s3File)).toBe("https://m/dl");
        expect(s3mock.s3.getDownloadUrl).toHaveBeenCalledWith(s3File.storageKey, { bucket: "codedev-chat-media", filename: "Report.pdf" });

        // R41: no overwrite, and the SDK's signed headers (if-none-match among them) reach the browser untouched.
        const signed = { "content-type": "application/pdf", "if-none-match": "*" };
        blob.signedUploadUrl.mockResolvedValue({ url: "https://u", headers: signed, expiresAt: new Date() });
        expect(await uploadTicket(upstashFile)).toEqual({ method: "PUT", url: "https://u", headers: signed });
        expect(blob.signedUploadUrl).toHaveBeenCalledWith(upstashFile.storageKey, { contentType: "application/pdf", size: 10, allowOverwrite: false });
        blob.info.mockResolvedValueOnce({ contentType: "application/pdf", size: 10, metadata: {} });
        expect(await inspect(upstashFile)).toEqual({ contentType: "application/pdf", size: 10 });
        blob.info.mockRejectedValueOnce(notFound({ code: "not_found" }));
        expect(await inspect(upstashFile)).toBeNull();
        blob.del.mockRejectedValueOnce(notFound({ code: "not_found" }));
        await expect(remove(upstashFile)).resolves.toBeUndefined();
        expect(blob.del).toHaveBeenCalledWith(upstashFile.storageKey);
    });

    it("passes downloadAs only for files (R42)", async () => {
        blob.signedReadUrl.mockResolvedValue({ url: "https://r", expiresAt: new Date() });
        await readUrl({ ...upstashFile, kind: "image", contentType: "image/png", fileName: null });
        expect(blob.signedReadUrl).toHaveBeenCalledWith(upstashFile.storageKey, {});
    });

    it("uses the MinIO chat bucket for s3 rows", async () => {
        s3mock.s3.presignPut.mockResolvedValue("https://m/put");
        expect(await uploadTicket(s3Image)).toEqual({ method: "PUT", url: "https://m/put", headers: { "Content-Type": "image/png", "Content-Length": "10" } });
        expect(s3mock.s3.presignPut).toHaveBeenCalledWith(s3Image.storageKey, { bucket: "codedev-chat-media", contentType: "image/png", size: 10 });
        s3mock.s3.head.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 5 });
        expect(await inspect(s3Image)).toEqual({ contentType: "image/png", size: 5 });
        s3mock.s3.head.mockRejectedValueOnce(notFound({ name: "NotFound", $metadata: { httpStatusCode: 404 } }));
        expect(await inspect(s3Image)).toBeNull();
        await remove(s3File);
        expect(s3mock.s3.delete).toHaveBeenCalledWith(s3File.storageKey, { bucket: "codedev-chat-media" });
    });

    it("exports only the attachment API", () => {
        expect(Object.keys(chatMedia).sort()).toEqual(["inspect", "readUrl", "remove", "storageFor", "storageKeyFor", "uploadTicket"]);
    });

    it("maps a Cloudinary not-found to null and rethrows other errors", async () => {
        cld.sdk.api.resource.mockResolvedValueOnce({ format: "webp", bytes: 42 });
        expect(await inspect(cloudImage)).toEqual({ contentType: "image/webp", size: 42 });
        expect(cld.sdk.api.resource).toHaveBeenCalledWith(cloudImage.storageKey, { type: "authenticated", resource_type: "image" });
        cld.sdk.api.resource.mockRejectedValueOnce({ error: { message: "Resource not found", http_code: 404 } });
        expect(await inspect(cloudImage)).toBeNull();
        cld.sdk.api.resource.mockRejectedValueOnce(Object.assign(new Error("nf"), { http_code: 404 }));
        expect(await inspect(cloudImage)).toBeNull();
        cld.sdk.api.resource.mockRejectedValueOnce({ error: { message: "Bad credentials", http_code: 401 } });
        await expect(inspect(cloudImage)).rejects.toMatchObject({ error: { http_code: 401 } });
    });

    it("answers 503 per kind when production storage is missing", async () => {
        vi.stubEnv("APP_ENV", "production");
        cld.configured.mockReturnValue(false);
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "");
        for (const fn of [uploadTicket, inspect, readUrl, remove]) {
            await expect(fn(cloudImage)).rejects.toMatchObject({ status: 503, message: "Chat images are not configured" });
            await expect(fn(upstashFile)).rejects.toMatchObject({ status: 503, message: "Chat files are not configured" });
        }
        for (const mock of [...Object.values(blob), ...Object.values(cld.sdk.utils), cld.sdk.api.resource, cld.destroyAsset]) {
            expect(mock).not.toHaveBeenCalled();
        }
    });
});
