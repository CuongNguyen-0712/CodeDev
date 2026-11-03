import { describe, expect, it } from "vitest";

import { coverFit, coverSrcSet } from "@/lib/coverFit";

describe("coverSrcSet", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/c_limit,w_1600/f_auto,q_auto/v1/codedev/courses/x/cover";

    it("offers smaller widths of the same Cloudinary asset", () => {
        const set = coverSrcSet(url);
        expect(set.split(", ")).toHaveLength(5);
        expect(set).toContain("/image/upload/c_limit,w_320/f_auto,q_auto/v1/codedev/courses/x/cover 320w");
        expect(set).toContain("c_limit,w_1600/f_auto,q_auto/v1/codedev/courses/x/cover 1600w");
    });

    it("leaves other URLs alone", () => {
        expect(coverSrcSet("/image/static/default.svg")).toBeUndefined();
        expect(coverSrcSet("https://res.cloudinary.com/demo/image/upload/v1/x.png")).toBeUndefined();
        expect(coverSrcSet(null)).toBeUndefined();
    });
});

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
