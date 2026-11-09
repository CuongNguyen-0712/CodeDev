import { describe, expect, it } from "vitest";

import { isAllowedMediaUrl, mediaOrigins } from "@/lib/media/mediaOrigins.mjs";

const PAYLOAD = "http://127.0.0.1:3010";
const CLOUDINARY = "https://res.cloudinary.com";

describe("mediaOrigins", () => {
    it("production allows Cloudinary only", () => {
        const origins = mediaOrigins({ NODE_ENV: "production", PAYLOAD_URL: PAYLOAD });
        expect(origins).toEqual([CLOUDINARY]);
    });

    it("development adds the Payload origin", () => {
        expect(mediaOrigins({ NODE_ENV: "development", PAYLOAD_URL: `${PAYLOAD}/` })).toEqual([CLOUDINARY, PAYLOAD]);
    });

    it("development without PAYLOAD_URL stays Cloudinary only", () => {
        expect(mediaOrigins({ NODE_ENV: "development" })).toEqual([CLOUDINARY]);
    });
});

describe("isAllowedMediaUrl", () => {
    const origins = [CLOUDINARY, PAYLOAD];

    it("rejects a foreign host", () => {
        expect(isAllowedMediaUrl("https://evil.example/x.png", origins)).toBe(false);
    });

    it("rejects a look-alike prefix", () => {
        expect(isAllowedMediaUrl("https://res.cloudinary.com.evil.io/x", origins)).toBe(false);
    });

    it("accepts a Payload file URL in development", () => {
        expect(isAllowedMediaUrl(`${PAYLOAD}/api/media/file/race-timeline.svg`, origins)).toBe(true);
    });

    it("rejects unparsable and empty input", () => {
        expect(isAllowedMediaUrl("not a url", origins)).toBe(false);
        expect(isAllowedMediaUrl(undefined, origins)).toBe(false);
    });
});

describe("next.config.js image remote patterns", () => {
    const loadConfig = async (env) => {
        const { createRequire } = await import("node:module");
        const path = await import("node:path");
        const require = createRequire(import.meta.url);
        const file = path.resolve("next.config.js");
        const saved = { APP_ENV: process.env.APP_ENV, PAYLOAD_URL: process.env.PAYLOAD_URL };
        Object.assign(process.env, env);
        delete require.cache[file];
        try {
            return require(file);
        } finally {
            for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
            delete require.cache[file];
        }
    };
    const payloadPattern = (config) => config.images.remotePatterns.find((p) => p.pathname === "/api/media/file/**");

    it("tolerates an unparseable PAYLOAD_URL", async () => {
        const config = await loadConfig({ APP_ENV: "development", PAYLOAD_URL: "not a url" });
        expect(payloadPattern(config)).toBeUndefined();
    });

    it("adds the Payload origin outside production only", async () => {
        expect(payloadPattern(await loadConfig({ APP_ENV: "development", PAYLOAD_URL: PAYLOAD }))).toMatchObject({ protocol: "http", hostname: "127.0.0.1", port: "3010" });
        expect(payloadPattern(await loadConfig({ APP_ENV: "production", PAYLOAD_URL: PAYLOAD }))).toBeUndefined();
    });
});
