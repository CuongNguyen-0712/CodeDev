import { describe, expect, it } from "vitest";

import { formatFileSize, isAllowedFile } from "@/lib/chat/fileInfo";

describe("fileInfo", () => {
    it("formats sizes in base 1000", () => {
        expect(formatFileSize(0)).toBe("1 KB");
        expect(formatFileSize(2500)).toBe("3 KB");
        expect(formatFileSize(999_999)).toBe("1000 KB");
        expect(formatFileSize(1_000_000)).toBe("1.0 MB");
        expect(formatFileSize(15_000_000)).toBe("15.0 MB");
    });
    it("allows only listed extensions, own keys only", () => {
        expect(isAllowedFile("A.PDF")).toBe(true);
        expect(isAllowedFile("setup.exe")).toBe(false);
        expect(isAllowedFile("constructor")).toBe(false);
        expect(isAllowedFile("x.constructor")).toBe(false);
    });
});
