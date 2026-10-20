import { describe, expect, it } from "vitest";

import { coverFit } from "@/lib/coverFit";

describe("coverFit", () => {
    it("fills the 16:9 frame with real covers and shows other shapes whole", () => {
        expect(coverFit(1600, 900)).toBe("cover");
        expect(coverFit(1280, 800)).toBe("cover"); // 16:10, close enough to crop a little
        expect(coverFit(128, 128)).toBe("contain"); // square logo / fallback icon
        expect(coverFit(900, 1600)).toBe("contain");
        expect(coverFit(2400, 900)).toBe("contain");
    });

    it("waits for the image size", () => {
        expect(coverFit(0, 0)).toBeNull();
        expect(coverFit(undefined, 900)).toBeNull();
    });
});
