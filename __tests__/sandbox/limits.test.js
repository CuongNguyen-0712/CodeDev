import { describe, expect, it } from "vitest";

import { queueCapacity } from "@/lib/challenges/limits";

describe("queueCapacity", () => {
    it("admits what the slots finish before the deadline", () => {
        // 2 slots, 5s per job: 72 runs finish within a 180s submit deadline, 18 within a 45s Run.
        expect(queueCapacity({ slots: 2, avgJobSec: 5, deadlineSec: 180, hardCap: 200 })).toBe(72);
        expect(queueCapacity({ slots: 2, avgJobSec: 5, deadlineSec: 45, hardCap: 200 })).toBe(18);
    });

    it("keeps sane bounds for slow, unknown and very fast jobs", () => {
        expect(queueCapacity({ slots: 2, avgJobSec: 120, deadlineSec: 45, hardCap: 200 })).toBe(4); // never below 2 per slot
        expect(queueCapacity({ slots: 2, avgJobSec: null, deadlineSec: 180, hardCap: 200 })).toBe(72); // no history: 5s
        expect(queueCapacity({ slots: 2, avgJobSec: 0.5, deadlineSec: 180, hardCap: 200 })).toBe(120); // at least 3s per job
        expect(queueCapacity({ slots: 16, avgJobSec: 3, deadlineSec: 180, hardCap: 200 })).toBe(200); // hard cap
    });
});
