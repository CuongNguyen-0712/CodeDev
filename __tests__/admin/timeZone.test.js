import { afterEach, describe, expect, it } from "vitest";

import { AUTO_TIME_ZONE, deviceTimeZone, isTimeZone, offsetLabel, resolveTimeZone, setDisplayTimeZone, timeZoneOptions } from "@/lib/timeZone";
import { formatDate, formatDateTime, formatTime } from "@/components/admin/ui/format";
import { safeTimeZone } from "@/services/adminDashboard.service";

afterEach(() => setDisplayTimeZone("UTC"));

describe("time zone helpers", () => {
    it("knows IANA names and rejects anything else", () => {
        expect(isTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
        expect(isTimeZone("UTC")).toBe(true);
        expect(isTimeZone("Mars/Olympus")).toBe(false);
        expect(isTimeZone("'; DROP TABLE x; --")).toBe(false);
        expect(isTimeZone("")).toBe(false);
        expect(isTimeZone(undefined)).toBe(false);
    });

    it("resolves auto, empty and unknown choices to the device zone", () => {
        expect(resolveTimeZone(AUTO_TIME_ZONE)).toBe(deviceTimeZone());
        expect(resolveTimeZone("Nowhere/Land")).toBe(deviceTimeZone());
        expect(resolveTimeZone("Europe/Paris")).toBe("Europe/Paris");
    });

    it("lists zones with UTC and labels offsets", () => {
        expect(timeZoneOptions()).toContain("UTC");
        expect(offsetLabel("Asia/Ho_Chi_Minh", new Date("2026-11-06T00:00:00Z"))).toBe("GMT+7");
    });

    it("lets only known zones reach SQL and cache keys", () => {
        expect(safeTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
        expect(safeTimeZone("x' OR 1=1")).toBe("UTC");
        expect(safeTimeZone(null)).toBe("UTC");
    });
});

describe("admin date formatting follows the display zone", () => {
    // 2026-11-05 20:30 UTC is already 6 November in Ho Chi Minh City (UTC+7).
    const instant = "2026-11-05T20:30:00Z";

    it("shows UTC by default", () => {
        expect(formatDate(instant)).toBe("2026-11-05");
        expect(formatTime(instant)).toBe("20:30");
    });

    it("moves dates and times into the chosen zone", () => {
        setDisplayTimeZone("Asia/Ho_Chi_Minh");
        expect(formatDate(instant)).toBe("2026-11-06");
        expect(formatTime(instant)).toBe("03:30");
        expect(formatDateTime(instant)).toBe("06/11/2026, 03:30");
    });

    it("ignores an unknown zone", () => {
        setDisplayTimeZone("Nowhere/Land");
        expect(formatDate(instant)).toBe("2026-11-05");
    });
});
