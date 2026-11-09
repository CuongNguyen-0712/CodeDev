import { describe, expect, it } from "vitest";

import { checkEnvironment } from "@/lib/envCheck.mjs";

const cloudinary = { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" };
const production = {
    APP_ENV: "production",
    DATABASE_URL: "postgres://db.example.com/codedev",
    NEXTAUTH_SECRET: "x",
    REFRESH_TOKEN_HASH_SECRET: "x",
    NEXTAUTH_URL: "https://codedev.example.com",
};
const all = (r) => [...r.errors, ...r.warnings].join(" | ");

describe("media settings in the start-up check", () => {
    it("requires CLOUDINARY_* in production as an error", () => {
        const r = checkEnvironment(production);
        expect(r.errors.some((m) => m.includes("CLOUDINARY_CLOUD_NAME"))).toBe(true);
        expect(r.warnings.some((m) => m.includes("CLOUDINARY"))).toBe(false);
        expect(all(checkEnvironment({ ...production, ...cloudinary }))).not.toContain("CLOUDINARY");
    });

    it("errors when PAYLOAD_URL is set in production", () => {
        const r = checkEnvironment({ ...production, ...cloudinary, PAYLOAD_URL: "x" });
        expect(r.errors.some((m) => m.includes("PAYLOAD_URL"))).toBe(true);
    });

    it("warns that CLOUDINARY_* is ignored outside production", () => {
        const r = checkEnvironment({ APP_ENV: "development", PAYLOAD_URL: "http://127.0.0.1:3010", ...cloudinary });
        expect(r.warnings.some((m) => m.includes("ignored outside production"))).toBe(true);
    });

    it("warns that uploads are disabled without PAYLOAD_URL outside production", () => {
        const r = checkEnvironment({ APP_ENV: "development" });
        expect(r.warnings.some((m) => m.includes("PAYLOAD_URL") && m.includes("uploads are disabled"))).toBe(true);
        expect(checkEnvironment({ APP_ENV: "development", PAYLOAD_URL: "http://127.0.0.1:3010" }).warnings.some((m) => m.includes("uploads are disabled"))).toBe(false);
    });
});
