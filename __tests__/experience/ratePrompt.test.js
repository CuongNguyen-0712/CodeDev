import { beforeEach, describe, expect, it } from "vitest";

import { askForRating } from "@/components/course/ratePromptDialog";
import { useRewardsStore } from "@/stores/rewardsStore";

beforeEach(() => useRewardsStore.setState(useRewardsStore.getInitialState()));

describe("askForRating", () => {
    it("asks for the milestone the lesson result names", () => {
        askForRating({ courseId: "c", prompt: { milestone: 50, stars: null } });
        expect(useRewardsStore.getState().ratePrompt).toEqual({ courseId: "c", milestone: 50 });
    });

    it("asks nothing without a prompt or a milestone", () => {
        askForRating({ courseId: "c", prompt: null });
        askForRating({ courseId: "c", prompt: { stars: null } });
        expect(useRewardsStore.getState().ratePrompt).toBeNull();
    });
});
