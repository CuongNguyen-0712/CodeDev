import { describe, expect, it } from "vitest";

import { isSingleEmoji } from "@/lib/chat/emoji";

describe("isSingleEmoji", () => {
    it.each(["👍", "👨‍👩‍👧", "🇻🇳", "👍🏽", "❤️", "#️⃣", "*️⃣", "0️⃣", "9️⃣", "1⃣"])("%s is a single emoji", (value) => {
        expect(isSingleEmoji(value)).toBe(true);
    });

    it.each(["👍👍", "a", "", "a👍", "🇻", "7", "#", "*", "7️", 7, null, undefined, "x".repeat(33), "👨‍👩‍👧‍👦‍👨‍👩‍👧‍👦‍👨"])("%j is not", (value) => {
        expect(isSingleEmoji(value)).toBe(false);
    });
});
