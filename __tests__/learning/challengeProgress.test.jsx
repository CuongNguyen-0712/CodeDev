// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The challenges embedded in a lesson and the Practice section share one progress state
 * (stores/lessonProgressStore.js). The quiz / coding bodies are replaced by a stub that reports
 * a pass the way they do (onPassed / onExhausted, with `initial` for a pass from an earlier visit).
 */
vi.mock("next/dynamic", () => ({
    default: () => function ChallengeBodyStub({ challenge, onPassed, onExhausted }) {
        return (
            <div>
                <button onClick={() => onPassed(challenge.id)}>pass {challenge.id}</button>
                <button onClick={() => onPassed(challenge.id, { initial: true })}>earlier pass {challenge.id}</button>
                <button onClick={() => onExhausted(challenge.id)}>exhaust {challenge.id}</button>
            </div>
        );
    },
}));
vi.mock("@/mutations/challenge.mutation", () => ({
    useOpenHint: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

const { default: ChallengeSection, ChallengeProgressProvider, InlineChallenge } = await import("@/components/learning/[id]/challengeSection");
const { EMPTY_PROGRESS, progressFor, useLessonProgressStore } = await import("@/stores/lessonProgressStore");

const LESSON = 7;
const challenges = [
    { id: 1, public_id: "chal_a", type: "quiz", title: "Embedded quiz", status: "open", difficulty: "easy" },
    { id: 2, public_id: "chal_b", type: "quiz", title: "Practice quiz", status: "open", difficulty: "easy" },
];
const resolved = () => progressFor(useLessonProgressStore.getState().byLesson[LESSON] ?? EMPTY_PROGRESS, [1, 2]).resolved;

let queryClient;
function renderLesson() {
    return render(
        <QueryClientProvider client={queryClient}>
            <ChallengeProgressProvider lessonId={LESSON} challenges={challenges}>
                <InlineChallenge publicId="chal_a" />
                <ChallengeSection embeddedIds={new Set(["chal_a"])} />
            </ChallengeProgressProvider>
        </QueryClientProvider>
    );
}

beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, "invalidateQueries");
    useLessonProgressStore.setState(useLessonProgressStore.getInitialState());
    window.history.replaceState(null, "", "/learning/course?lesson=7");
});
afterEach(cleanup);

describe("lesson challenge progress", () => {
    it("a fresh pass updates the badge, marks the URL and refetches the syllabus", () => {
        renderLesson();
        expect(screen.getByText("0/1 passed")).toBeTruthy();

        fireEvent.click(screen.getByText("pass 1"));
        expect(screen.getByText("Passed")).toBeTruthy();
        expect(window.location.hash).toBe("#challenge-1");
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["user", "learningProgress"] });
        // The embedded challenge is not part of the Practice count.
        expect(screen.getByText("0/1 passed")).toBeTruthy();

        fireEvent.click(screen.getByText("pass 2"));
        expect(screen.getByText("1/1 passed")).toBeTruthy();
        expect(resolved()).toBe(2);
    });

    it("a pass from an earlier visit only updates the state", () => {
        renderLesson();
        fireEvent.click(screen.getByText("earlier pass 2"));
        expect(screen.getByText("1/1 passed")).toBeTruthy();
        expect(window.location.hash).toBe("");
        expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("out of attempts resolves the challenge without passing it", () => {
        renderLesson();
        fireEvent.click(screen.getByText("exhaust 2"));
        expect(screen.getByText("Out of attempts")).toBeTruthy();
        expect(screen.getByText("0/1 passed")).toBeTruthy();
        expect(resolved()).toBe(1);
        expect(window.location.hash).toBe("#challenge-2");
    });

    it("leaving the lesson drops its progress", () => {
        const view = renderLesson();
        fireEvent.click(screen.getByText("pass 1"));
        view.unmount();
        expect(useLessonProgressStore.getState().byLesson[LESSON]).toBeUndefined();
    });
});
