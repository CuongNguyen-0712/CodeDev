import { describe, expect, it } from "vitest";

import { parseLocal, toLocalValue } from "@/components/admin/ui/dateField";

describe("DateField values", () => {
    it("reads date and date-time strings as local time and writes them back unchanged", () => {
        expect(toLocalValue(parseLocal("2026-11-06"), false)).toBe("2026-11-06");
        expect(toLocalValue(parseLocal("2026-11-06T09:05"), true)).toBe("2026-11-06T09:05");
        expect(parseLocal("2026-11-06T09:05").getHours()).toBe(9);
    });

    it("gives null for empty or broken values", () => {
        expect(parseLocal("")).toBeNull();
        expect(parseLocal("not-a-date")).toBeNull();
    });
});
