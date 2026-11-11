// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/** The course page's rating section: stars only select, Submit casts the one vote; the hooks are replaced. */
const rate = { isPending: false, mutate: vi.fn() };
let view;
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/mutations/course.mutation", () => ({ useCourseRate: () => rate }));
vi.mock("@/queries/course.query", () => ({ courseQueries: { rating: () => ({ queryKey: ["rating"] }) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: view, isLoading: false, isError: false }) }));

const { default: RatingSection } = await import("@/components/course/params/ratingSection");

const base = { average: null, count: 1, breakdown: [], next: 100, eligible: false, reason: null };
afterEach(() => { cleanup(); rate.mutate.mockClear(); });

describe("rating section", () => {
    it("picking stars sends nothing; Submit casts one vote with the stars picked", () => {
        view = { ...base, milestone: 50, eligible: true, history: [{ milestone: 20, stars: 3 }] };
        render(<RatingSection courseId="c" />);
        const submit = screen.getByRole("button", { name: "Submit rating" });
        expect(submit.disabled).toBe(true);

        fireEvent.click(screen.getByLabelText("4 stars"));
        expect(rate.mutate).not.toHaveBeenCalled();
        expect(submit.disabled).toBe(false);

        fireEvent.click(submit);
        expect(rate.mutate).toHaveBeenCalledTimes(1);
        expect(rate.mutate.mock.calls[0][0]).toEqual({ courseId: "c", stars: 4 });
        expect(screen.getByText("Rate it at 50%")).toBeTruthy();
    });

    it("shows the votes and when the next rating opens, with nothing to click", () => {
        view = { ...base, milestone: null, reason: "voted", next: 50, history: [{ milestone: 20, stars: 3 }] };
        render(<RatingSection courseId="c" />);
        expect(screen.getByText("Your next rating opens at 50%.")).toBeTruthy();
        expect(screen.queryByRole("radiogroup")).toBeNull();
        expect(screen.queryByRole("button", { name: "Submit rating" })).toBeNull();
    });

    it("says the learner is done after the last milestone", () => {
        view = { ...base, milestone: null, reason: "done", next: null, history: [{ milestone: 100, stars: 5 }] };
        render(<RatingSection courseId="c" />);
        expect(screen.getByText("You rated every milestone of this course.")).toBeTruthy();
    });
});
