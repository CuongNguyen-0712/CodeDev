import { describe, expect, it } from "vitest";
import { cleanFileName } from "@/lib/chat/cleanFileName";

describe("cleanFileName", () => {
    it("strips paths, C0/C1 and bidi controls", () => {
        expect(cleanFileName("C:\\x\\a/b\u0000c\u007f\u0085.pdf")).toBe("bc.pdf");
        expect(cleanFileName("invoice\u202Efdp.zip\u200e\u200f\u2066\u2069")).toBe("invoicefdp.zip");
    });
    it("keeps ordinary and non-latin names, trims, caps at 255", () => {
        expect(cleanFileName("  báo cáo.pdf ")).toBe("báo cáo.pdf");
        expect(cleanFileName("a".repeat(300))).toHaveLength(255);
        expect(cleanFileName(null)).toBe("");
    });
});
