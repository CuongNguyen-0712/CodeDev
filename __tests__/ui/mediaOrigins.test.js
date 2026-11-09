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
