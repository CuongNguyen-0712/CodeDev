import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
    signedUploadUrl: vi.fn(),
    signedReadUrl: vi.fn(),
    info: vi.fn(),
    del: vi.fn(),
}));
const s3mock = vi.hoisted(() => ({
    buckets: { chat: "codedev-chat-media" },
    storageInfo: vi.fn(() => ({ chatImagesConfigured: true })),
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

import {
    chatMediaProvider, chatMediaKey, signUpload, signRead, inspect, remove,
    storageFor, storageKeyFor, uploadTicket, inspectAttachment, readUrl, removeAttachment,
} from "@/lib/chatMedia.js";

const KEY = "chat/cnv_x/att_y.png";
const notFound = (extra) => Object.assign(new Error("nf"), extra);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("provider and keys", () => {
    it("uses Upstash when UPSTASH_BLOB_TOKEN is set", () => {
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "t");
        expect(chatMediaProvider()).toBe("upstash");
    });
    it("uses S3 otherwise", () => {
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "");
        expect(chatMediaProvider()).toBe("s3");
    });
    it("builds keys from public ids only", () => {
        const key = (contentType) => chatMediaKey({ conversationId: "cnv_x", attachmentId: "att_y", contentType });
        expect(key("image/webp")).toBe("chat/cnv_x/att_y.webp");
        expect(key("image/jpeg")).toBe("chat/cnv_x/att_y.jpg");
        expect(key("image/png")).toBe(KEY);
        expect(() => key("image/gif")).toThrow();
    });
});

describe("upstash", () => {
    beforeEach(() => vi.stubEnv("UPSTASH_BLOB_TOKEN", "t"));

    it("signs an upload with the declared type and size", async () => {
        blob.signedUploadUrl.mockResolvedValue({ url: "https://u", headers: { "content-type": "image/png" }, expiresAt: new Date() });
        const result = await signUpload(KEY, { contentType: "image/png", size: 1234 });
        expect(blob.signedUploadUrl).toHaveBeenCalledWith(KEY, { contentType: "image/png", size: 1234 });
        expect(result).toEqual({ url: "https://u", method: "PUT", headers: { "content-type": "image/png" } });
    });
    it("signs a read", async () => {
        const expiresAt = new Date();
        blob.signedReadUrl.mockResolvedValue({ url: "https://r", expiresAt });
        expect(await signRead(KEY)).toEqual({ url: "https://r", expiresAt });
    });
    it("inspect returns type and size, null when missing, rethrows others", async () => {
        blob.info.mockResolvedValueOnce({ contentType: "image/png", size: 5 });
        expect(await inspect(KEY)).toEqual({ contentType: "image/png", size: 5 });
        blob.info.mockRejectedValueOnce(notFound({ code: "not_found" }));
        expect(await inspect(KEY)).toBeNull();
        blob.info.mockRejectedValueOnce(notFound({ code: "unauthorized" }));
        await expect(inspect(KEY)).rejects.toThrow();
    });
    it("remove ignores a missing object", async () => {
        blob.del.mockRejectedValueOnce(notFound({ code: "not_found" }));
        await expect(remove(KEY)).resolves.toBeUndefined();
        expect(blob.del).toHaveBeenCalledWith(KEY);
    });
});

describe("s3", () => {
    beforeEach(() => vi.stubEnv("UPSTASH_BLOB_TOKEN", ""));

    it("signs an upload with the declared type and size", async () => {
        s3mock.s3.presignPut.mockResolvedValue("https://m/put");
        const result = await signUpload(KEY, { contentType: "image/png", size: 1234 });
        expect(s3mock.s3.presignPut).toHaveBeenCalledWith(KEY, { bucket: "codedev-chat-media", contentType: "image/png", size: 1234 });
        expect(result).toEqual({ url: "https://m/put", method: "PUT", headers: { "Content-Type": "image/png", "Content-Length": "1234" } });
    });
    it("signs a read for 300 seconds", async () => {
        s3mock.s3.presignGet.mockResolvedValue("https://m/get");
        const before = Date.now();
        const { url, expiresAt } = await signRead(KEY);
        expect(url).toBe("https://m/get");
        expect(s3mock.s3.presignGet).toHaveBeenCalledWith(KEY, { bucket: "codedev-chat-media", expiresIn: 300 });
        expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(299_000);
    });
    it("inspect returns null on 404", async () => {
        s3mock.s3.head.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 5 });
        expect(await inspect(KEY)).toEqual({ contentType: "image/png", size: 5 });
        s3mock.s3.head.mockRejectedValueOnce(notFound({ name: "NotFound", $metadata: { httpStatusCode: 404 } }));
        expect(await inspect(KEY)).toBeNull();
    });
    it("remove deletes from the chat bucket", async () => {
        await remove(KEY);
        expect(s3mock.s3.delete).toHaveBeenCalledWith(KEY, { bucket: "codedev-chat-media" });
    });
});

describe("unconfigured chat storage", () => {
    it("throws 503 before touching any client", async () => {
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "");
        s3mock.storageInfo.mockReturnValue({ chatImagesConfigured: false });
        for (const call of [() => signUpload(KEY, { contentType: "image/png", size: 1 }), () => signRead(KEY), () => inspect(KEY), () => remove(KEY)]) {
            await expect(call()).rejects.toMatchObject({ status: 503, message: "Chat images are not configured" });
        }
        expect(s3mock.s3.presignPut).not.toHaveBeenCalled();
        expect(s3mock.s3.head).not.toHaveBeenCalled();
        s3mock.storageInfo.mockReturnValue({ chatImagesConfigured: true });
    });
});

describe("attachment storage adapter", () => {
    const CNV = "cnv_0123456789abcdefghijklmnop";
    const ATT = "att_0123456789abcdefghijklmnop";
    const cloudImage = { kind: "image", provider: "cloudinary", storageKey: `codedev/chat/${CNV}/${ATT}`, contentType: "image/png", size: 10, fileName: null };
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
        expect(params).toEqual({
            public_id: cloudImage.storageKey, timestamp: expect.any(Number), type: "authenticated",
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

        await removeAttachment(cloudImage);
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

        blob.signedUploadUrl.mockResolvedValue({ url: "https://u", headers: { "content-type": "application/pdf" }, expiresAt: new Date() });
        expect(await uploadTicket(upstashFile)).toEqual({ method: "PUT", url: "https://u", headers: { "content-type": "application/pdf" } });
        expect(blob.signedUploadUrl).toHaveBeenCalledWith(upstashFile.storageKey, { contentType: "application/pdf", size: 10 });
        blob.info.mockResolvedValueOnce({ contentType: "application/pdf", size: 10, metadata: {} });
        expect(await inspectAttachment(upstashFile)).toEqual({ contentType: "application/pdf", size: 10 });
        blob.info.mockRejectedValueOnce(notFound({ code: "not_found" }));
        expect(await inspectAttachment(upstashFile)).toBeNull();
        blob.del.mockRejectedValueOnce(notFound({ code: "not_found" }));
        await expect(removeAttachment(upstashFile)).resolves.toBeUndefined();
        expect(blob.del).toHaveBeenCalledWith(upstashFile.storageKey);
    });

    it("maps a Cloudinary not-found to null and rethrows other errors", async () => {
        cld.sdk.api.resource.mockResolvedValueOnce({ format: "webp", bytes: 42 });
        expect(await inspectAttachment(cloudImage)).toEqual({ contentType: "image/webp", size: 42 });
        expect(cld.sdk.api.resource).toHaveBeenCalledWith(cloudImage.storageKey, { type: "authenticated", resource_type: "image" });
        cld.sdk.api.resource.mockRejectedValueOnce({ error: { message: "Resource not found", http_code: 404 } });
        expect(await inspectAttachment(cloudImage)).toBeNull();
        cld.sdk.api.resource.mockRejectedValueOnce(Object.assign(new Error("nf"), { http_code: 404 }));
        expect(await inspectAttachment(cloudImage)).toBeNull();
        cld.sdk.api.resource.mockRejectedValueOnce({ error: { message: "Bad credentials", http_code: 401 } });
        await expect(inspectAttachment(cloudImage)).rejects.toMatchObject({ error: { http_code: 401 } });
    });

    it("answers 503 per kind when production storage is missing", async () => {
        vi.stubEnv("APP_ENV", "production");
        cld.configured.mockReturnValue(false);
        vi.stubEnv("UPSTASH_BLOB_TOKEN", "");
        for (const fn of [uploadTicket, inspectAttachment, readUrl, removeAttachment]) {
            await expect(fn(cloudImage)).rejects.toMatchObject({ status: 503, message: "Chat images are not configured" });
            await expect(fn(upstashFile)).rejects.toMatchObject({ status: 503, message: "Chat files are not configured" });
        }
        for (const mock of [...Object.values(blob), ...Object.values(cld.sdk.utils), cld.sdk.api.resource, cld.destroyAsset]) {
            expect(mock).not.toHaveBeenCalled();
        }
    });
});
