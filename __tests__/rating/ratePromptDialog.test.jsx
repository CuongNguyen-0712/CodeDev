// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/** The milestone prompt: a vote the server refuses for good (already cast, nothing open) closes it. */
const rate = { isPending: false, mutateAsync: vi.fn() };
const showAlert = vi.fn();
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));
vi.mock("@/mutations/course.mutation", () => ({ useCourseRate: () => rate }));

const { RatePromptDialog, askForRating } = await import("@/components/course/ratePromptDialog");
const { useRewardsStore } = await import("@/stores/rewardsStore");

const refused = (status, code) => Object.assign(new Error("refused"), { status, code });

beforeEach(() => useRewardsStore.setState(useRewardsStore.getInitialState()));
afterEach(() => { cleanup(); rate.mutateAsync.mockReset(); showAlert.mockClear(); });

async function voteInDialog() {
    act(() => askForRating({ courseId: "c", prompt: { milestone: 20, stars: null } }));
    render(<RatePromptDialog />);
    fireEvent.click(screen.getByLabelText("4 stars"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save rating" })); });
}

describe("rate prompt dialog", () => {
    it.each([[409, "RATING_CLOSED"], [403, "RATING_NOT_ALLOWED"]])("closes when the vote is refused for good (%i %s)", async (status, code) => {
        rate.mutateAsync.mockRejectedValueOnce(refused(status, code));
        await voteInDialog();
        expect(showAlert).toHaveBeenCalledWith(status, "refused");
        expect(useRewardsStore.getState().ratePrompt).toBeNull();
    });

    it("stays open to retry after a network error", async () => {
        rate.mutateAsync.mockRejectedValueOnce(refused(500));
        await voteInDialog();
        expect(useRewardsStore.getState().ratePrompt).toEqual({ courseId: "c", milestone: 20 });
    });
});
