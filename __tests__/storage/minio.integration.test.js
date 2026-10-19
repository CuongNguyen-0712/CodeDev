import { describe, expect, it } from "vitest";
import crypto from "crypto";

/** Real round trip through lib/s3 against the compose.yml MinIO (skipped when it is down). */
const endpoint = process.env.MINIO_ENDPOINT;
const reachable = endpoint
    ? await fetch(`${endpoint}/minio/health/live`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false)
    : false;

describe.skipIf(!reachable)("object storage on MinIO", () => {
    it("writes, reads and deletes a private submission object", async () => {
        const { s3, buckets, bucketForKey, storageInfo, checkStorage } = await import("@/lib/s3");
        expect(storageInfo().provider).toBe("minio");
        await expect(checkStorage()).resolves.toBe(true);

        const key = `coding/vitest/${crypto.randomUUID()}.js`;
        expect(bucketForKey(key)).toBe(buckets.private);

        const body = "export const answer = 42;\n";
        await expect(s3.putText({ key, body })).resolves.toMatchObject({ bucket: buckets.private, size: body.length });
        await expect(s3.getText(key)).resolves.toBe(body);
        await s3.delete(key);
        await expect(s3.getText(key)).rejects.toMatchObject({ name: "NoSuchKey" });
    });

    it("serves the challenge files synced from Neon", async () => {
        const { s3 } = await import("@/lib/s3");
        const starter = await s3.getText("challenges/javascript/chal_fix_102/starter.js");
        expect(starter.length).toBeGreaterThan(0);
    });
});
