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
        expect(screen.getByText("Your rating")).toBeTruthy();
    });

    it("shows only the learner's latest vote while no milestone is open, with nothing to click", () => {
        view = { ...base, milestone: null, reason: "voted", next: 50, history: [{ milestone: 20, stars: 2 }, { milestone: 50, stars: 3 }] };
        render(<RatingSection courseId="c" />);
        const row = screen.getByText("Your rating").parentElement;
        expect(row.textContent).toBe("Your rating3out of 5");
        expect(screen.queryByText(/next rating/)).toBeNull();
        expect(screen.queryByText(/%/)).toBeNull();
        expect(screen.queryByRole("radiogroup")).toBeNull();
        expect(screen.queryByRole("button", { name: "Submit rating" })).toBeNull();
    });

    it("shows only the learner's latest vote after the last milestone too", () => {
        view = { ...base, milestone: null, reason: "done", next: null, history: [{ milestone: 100, stars: 5 }] };
        render(<RatingSection courseId="c" />);
        expect(screen.getByText("Your rating").parentElement.textContent).toBe("Your rating5out of 5");
        expect(screen.queryByText(/every milestone/)).toBeNull();
    });
});
