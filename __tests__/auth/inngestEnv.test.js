import { describe, expect, it } from "vitest";

import { checkEnvironment } from "@/lib/envCheck.mjs";

const production = {
    APP_ENV: "production",
    DATABASE_URL: "postgres://db.example.com/codedev",
    NEXTAUTH_SECRET: "x",
    REFRESH_TOKEN_HASH_SECRET: "x",
    NEXTAUTH_URL: "https://codedev.example.com",
    STORAGE_PROVIDER: "s3",
    AWS_ENDPOINT_URL_S3: "https://s3.example.com",
    AWS_ACCESS_KEY_ID: "x",
    AWS_SECRET_ACCESS_KEY: "x",
};

describe("Inngest settings in the start-up check", () => {
    it("refuses INNGEST_DEV in production: it turns off request signing", () => {
        const { fatal } = checkEnvironment({ ...production, INNGEST_DEV: "1", INNGEST_EVENT_KEY: "k", INNGEST_SIGNING_KEY: "s" });
        expect(fatal.some((m) => m.includes("INNGEST_DEV"))).toBe(true);
        expect(checkEnvironment({ ...production, INNGEST_DEV: "0" }).fatal.some((m) => m.includes("INNGEST_DEV"))).toBe(false);
    });

    it("reports an event key without a signing key, and warns when Inngest is not configured", () => {
        expect(checkEnvironment({ ...production, INNGEST_EVENT_KEY: "k" }).errors.some((m) => m.includes("INNGEST_SIGNING_KEY"))).toBe(true);
        expect(checkEnvironment(production).warnings.some((m) => m.includes("INNGEST_EVENT_KEY"))).toBe(true);
        const ok = checkEnvironment({ ...production, INNGEST_EVENT_KEY: "k", INNGEST_SIGNING_KEY: "s" });
        expect([...ok.fatal, ...ok.errors, ...ok.warnings].some((m) => m.includes("INNGEST"))).toBe(false);
    });

    it("allows INNGEST_DEV in development", () => {
        expect(checkEnvironment({ APP_ENV: "development", INNGEST_DEV: "1" }).fatal.some((m) => m.includes("INNGEST"))).toBe(false);
    });
});
