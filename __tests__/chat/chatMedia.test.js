import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
    signedUploadUrl: vi.fn(),
    signedReadUrl: vi.fn(),
    info: vi.fn(),
    del: vi.fn(),
}));
const s3mock = vi.hoisted(() => ({
    buckets: { chat: "codedev-chat-media" },
    storageInfo: vi.fn(() => ({ chatConfigured: true })),
    s3: { presignPut: vi.fn(), presignGet: vi.fn(), head: vi.fn(), delete: vi.fn() },
}));

vi.mock("@upstash/blob", () => ({ Bucket: { fromEnv: () => blob } }));
vi.mock("@/lib/s3.js", () => s3mock);

import { chatMediaProvider, chatMediaKey, signUpload, signRead, inspect, remove } from "@/lib/chatMedia.js";

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
        s3mock.storageInfo.mockReturnValue({ chatConfigured: false });
        for (const call of [() => signUpload(KEY, { contentType: "image/png", size: 1 }), () => signRead(KEY), () => inspect(KEY), () => remove(KEY)]) {
            await expect(call()).rejects.toMatchObject({ status: 503, message: "Chat images are not configured" });
        }
        expect(s3mock.s3.presignPut).not.toHaveBeenCalled();
        expect(s3mock.s3.head).not.toHaveBeenCalled();
        s3mock.storageInfo.mockReturnValue({ chatConfigured: true });
    });
});
