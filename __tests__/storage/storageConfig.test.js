import { describe, expect, it } from "vitest";

import { resolveStorageConfig, s3ClientOptions, describeStorage } from "@/lib/storageConfig.mjs";
import { appEnv, isLocalUrl } from "@/lib/appEnv.mjs";
import { checkEnvironment } from "@/lib/envCheck.mjs";

const MINIO = "http://127.0.0.1:9000";
const minioEnv = { MINIO_ENDPOINT: MINIO, MINIO_ROOT_USER: "minio-user", MINIO_ROOT_PASSWORD: "minio-password" };
const NEON = "https://br-example.storage.c-1.us-east-1.aws.neon.tech";
const neonEnv = { AWS_ENDPOINT_URL_S3: NEON, AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" };

describe("environment", () => {
    it("derives APP_ENV from NODE_ENV unless set", () => {
        expect(appEnv({ NODE_ENV: "development" })).toBe("development");
        expect(appEnv({ NODE_ENV: "production" })).toBe("production");
        expect(appEnv({ NODE_ENV: "production", APP_ENV: "development" })).toBe("development");
        expect(appEnv({ NODE_ENV: "test" })).toBe("test");
        expect(appEnv({ APP_ENV: "staging", NODE_ENV: "production" })).toBe("production");
    });

    it("recognises local endpoints", () => {
        expect(isLocalUrl(MINIO)).toBe(true);
        expect(isLocalUrl("http://minio.localhost:9000")).toBe(true);
        expect(isLocalUrl("http://127.0.0.1:4566")).toBe(true);
        expect(isLocalUrl("postgres://u:p@localhost:5432/db")).toBe(true);
        expect(isLocalUrl(NEON)).toBe(false);
        expect(isLocalUrl("not a url")).toBe(false);
    });
});

describe("storage per environment", () => {
    it("development uses the local MinIO with its own credentials", () => {
        const config = resolveStorageConfig({ NODE_ENV: "development", ...minioEnv, ...neonEnv });
        expect(config).toMatchObject({ provider: "minio", endpoint: MINIO, errors: [] });
        expect(config.credentials).toEqual({ accessKeyId: "minio-user", secretAccessKey: "minio-password" });
        expect(resolveStorageConfig({ NODE_ENV: "development", ...minioEnv, MINIO_ACCESS_KEY: "app", MINIO_SECRET_KEY: "app-secret" }).credentials)
            .toEqual({ accessKeyId: "app", secretAccessKey: "app-secret" });
        expect(resolveStorageConfig({ NODE_ENV: "development", MINIO_ENDPOINT: MINIO }).errors.join()).toMatch(/MINIO_ROOT_USER/);
        expect(config.buckets).toEqual({ public: "public", private: "private" });
        expect(s3ClientOptions(config)).toMatchObject({ forcePathStyle: true, endpoint: MINIO });
    });

    it("production uses S3 (Neon) and ignores MINIO_ENDPOINT", () => {
        const config = resolveStorageConfig({ NODE_ENV: "production", ...minioEnv, ...neonEnv });
        expect(config).toMatchObject({ provider: "s3", endpoint: NEON, errors: [] });
    });

    it("production refuses the development MinIO and local endpoints", () => {
        const forced = resolveStorageConfig({ NODE_ENV: "production", STORAGE_PROVIDER: "minio", ...minioEnv });
        expect(forced.errors.join()).toMatch(/development MinIO/);
        expect(() => s3ClientOptions(forced)).toThrow(/misconfigured/);

        const local = resolveStorageConfig({ NODE_ENV: "production", ...neonEnv, AWS_ENDPOINT_URL_S3: "http://localhost:9000" });
        expect(local.errors.join()).toMatch(/local endpoint/);
    });

    it("development does not silently write to remote storage", () => {
        const implicit = resolveStorageConfig({ NODE_ENV: "development", ...neonEnv });
        expect(implicit.errors.join()).toMatch(/MINIO_ENDPOINT/);

        const explicit = resolveStorageConfig({ NODE_ENV: "development", STORAGE_PROVIDER: "s3", ...neonEnv });
        expect(explicit.errors).toEqual([]);
        expect(explicit.warnings.join()).toMatch(/remote storage/);
    });

    it("start-up check names variables, never their values", () => {
        expect(describeStorage(resolveStorageConfig({ NODE_ENV: "production", ...neonEnv }))).not.toContain("secret");
        const check = checkEnvironment({ NODE_ENV: "production", ...neonEnv, DATABASE_URL: "postgres://u:pw@db.neon.tech/x", NEXTAUTH_URL: "http://example.com" });
        expect(JSON.stringify(check)).not.toMatch(/secret|pw@/);
        expect(check.errors).toEqual(expect.arrayContaining(["NEXTAUTH_SECRET is not set", "NEXTAUTH_URL must use https in production"]));
    });

    it("only a broken environment split is fatal in production", () => {
        const base = { NODE_ENV: "production", DATABASE_URL: "postgres://db.neon.tech/x", NEXTAUTH_URL: "https://codedev.example" };
        // Missing secrets are reported, but do not stop the server.
        expect(checkEnvironment({ ...base, ...neonEnv }).fatal).toEqual([]);
        // Production wired to the development MinIO does.
        const crossed = checkEnvironment({ ...base, STORAGE_PROVIDER: "minio", ...minioEnv });
        expect(crossed.fatal.join()).toMatch(/development MinIO/);
    });
});
