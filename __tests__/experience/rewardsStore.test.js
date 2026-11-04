import { beforeEach, describe, expect, it } from "vitest";

import { selectRatePromptOpen, useRewardsStore } from "@/stores/rewardsStore";

const store = () => useRewardsStore.getState();

beforeEach(() => {
    useRewardsStore.setState(useRewardsStore.getInitialState());
});

describe("rewardsStore", () => {
    it("opens the rating prompt at once when no level-up is showing", () => {
        store().askForRating({ courseId: 7, stars: null });
        expect(selectRatePromptOpen(store())).toBe(true);
    });

    it("holds the rating prompt behind the level-up dialog, in either call order", () => {
        store().showLevelUp({ level: 3, previousLevel: 2 });
        store().askForRating({ courseId: 7, stars: 4 });
        expect(selectRatePromptOpen(store())).toBe(false);

        store().closeLevelUp();
        expect(selectRatePromptOpen(store())).toBe(true);
        expect(store().ratePrompt).toEqual({ courseId: 7, stars: 4 });

        store().closeRatePrompt();
        store().askForRating({ courseId: 8, stars: null });
        store().showLevelUp({ level: 4, previousLevel: 3 });
        expect(selectRatePromptOpen(store())).toBe(false);
    });

    it("closeRatePrompt clears the request", () => {
        store().askForRating({ courseId: 7, stars: null });
        store().closeRatePrompt();
        expect(store().ratePrompt).toBeNull();
        expect(selectRatePromptOpen(store())).toBe(false);
    });

    it("bumpRewards counts every award", () => {
        store().bumpRewards();
        store().bumpRewards();
        expect(store().rewardsSeq).toBe(2);
    });
});
