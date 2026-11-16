import { describe, expect, it } from "vitest";

import { GROUP_GAP_MS, groupFlags } from "@/components/chat/messageGroups";

const msg = (sender, minute) => ({ sender: { id: sender }, createdAt: new Date(Date.UTC(2026, 10, 16, 10, minute)).toISOString() });

describe("groupFlags", () => {
    it("groups one sender's messages within the gap, and splits on a new sender", () => {
        expect(groupFlags([msg("a", 0), msg("a", 1), msg("b", 2), msg("a", 3)])).toEqual([
            { groupStart: true, groupEnd: false },
            { groupStart: false, groupEnd: true },
            { groupStart: true, groupEnd: true },
            { groupStart: true, groupEnd: true },
        ]);
    });

    it("splits the same sender after the gap", () => {
        const minutes = GROUP_GAP_MS / 60_000;
        expect(groupFlags([msg("a", 0), msg("a", minutes + 1)])).toEqual([
            { groupStart: true, groupEnd: true },
            { groupStart: true, groupEnd: true },
        ]);
    });

    it("keeps a message still being sent (no createdAt) with the sender's latest ones", () => {
        const recent = { sender: { id: "a" }, createdAt: new Date().toISOString() };
        const sending = { sender: { id: "a" } };
        expect(groupFlags([recent, sending])).toEqual([
            { groupStart: true, groupEnd: false },
            { groupStart: false, groupEnd: true },
        ]);
    });
});
