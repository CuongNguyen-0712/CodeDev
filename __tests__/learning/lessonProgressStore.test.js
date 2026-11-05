import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, progressFor, useLessonProgressStore } from "@/stores/lessonProgressStore";

const store = () => useLessonProgressStore.getState();
const entry = (lessonId) => store().byLesson[lessonId] ?? EMPTY_PROGRESS;

beforeEach(() => {
    useLessonProgressStore.setState(useLessonProgressStore.getInitialState());
});

describe("lessonProgressStore", () => {
    it("records a pass once: a repeat keeps the same state object", () => {
        store().markPassed(1, 10);
        const after = useLessonProgressStore.getState();
        store().markPassed(1, 10);
        expect(useLessonProgressStore.getState()).toBe(after);
        expect([...entry(1).completed]).toEqual([10]);
    });

    it("keeps lessons apart", () => {
        store().markPassed(1, 10);
        store().markExhausted(2, 20);
        expect(entry(1).exhausted.size).toBe(0);
        expect(entry(2).completed.size).toBe(0);
        expect(entry(2).exhausted.has(20)).toBe(true);
    });

    it("never mutates the shared empty value", () => {
        store().markPassed(1, 10);
        expect(EMPTY_PROGRESS.completed.size).toBe(0);
    });

    it("reset drops one lesson, and is a no-op for an unknown one", () => {
        store().markPassed(1, 10);
        store().markPassed(2, 20);
        store().reset(1);
        expect(store().byLesson[1]).toBeUndefined();
        expect(entry(2).completed.has(20)).toBe(true);

        const before = useLessonProgressStore.getState();
        store().reset(99);
        expect(useLessonProgressStore.getState()).toBe(before);
    });

    it("progressFor counts only required ids; exhausted is resolved, not passed", () => {
        store().markPassed(1, 10);
        store().markExhausted(1, 11);
        store().markPassed(1, 99); // a closed challenge: not required
        expect(progressFor(entry(1), [10, 11, 12])).toEqual({ passed: 1, resolved: 2, total: 3 });
        expect(progressFor(EMPTY_PROGRESS, [])).toEqual({ passed: 0, resolved: 0, total: 0 });
    });
});
