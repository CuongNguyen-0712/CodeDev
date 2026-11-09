import { describe, expect, it } from "vitest";

import { nextLikeState } from "@/lib/blog/likeState.mjs";

describe("nextLikeState", () => {
    it("feed: a flipped liked source keeps the server's count when the count source is unchanged", () => {
        const result = nextLikeState({ liked: true, count: 6 }, { liked: false, count: 5 }, { liked: true, count: 5 }, false);
        expect(result.state).toEqual({ liked: true, count: 6 });
    });

    it("post page: both sources changing re-seed both", () => {
        const result = nextLikeState({ liked: true, count: 6 }, { liked: false, count: 5 }, { liked: true, count: 6 }, false);
        expect(result.state).toEqual({ liked: true, count: 6 });
    });

    it("unlike mirrors like", () => {
        const result = nextLikeState({ liked: false, count: 4 }, { liked: true, count: 5 }, { liked: false, count: 5 }, false);
        expect(result.state).toEqual({ liked: false, count: 4 });
    });

    it("changes nothing while pending", () => {
        const state = { liked: true, count: 6 };
        const seen = { liked: false, count: 5 };
        expect(nextLikeState(state, seen, { liked: true, count: 9 }, true)).toEqual({ state, seen });
    });
});
