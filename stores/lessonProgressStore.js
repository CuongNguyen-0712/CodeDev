import { create } from "zustand";

// Read for a lesson with no recorded result yet: one shared frozen value, so selectors stay stable.
export const EMPTY_PROGRESS = Object.freeze({ completed: new Set(), exhausted: new Set() });

const add = (s, lessonId, field, challengeId) => {
    const entry = s.byLesson[lessonId] ?? EMPTY_PROGRESS;
    if (entry[field].has(challengeId)) return s;
    return { byLesson: { ...s.byLesson, [lessonId]: { ...entry, [field]: new Set(entry[field]).add(challengeId) } } };
};

/**
 * Pass / out-of-attempts state of the challenges of each open lesson, shared by the challenges
 * embedded in the lesson content and the Practice section (components/learning/[id]/challengeSection.jsx).
 * Naming and structure rules: docs/state-management.md.
 */
export const useLessonProgressStore = create((set) => ({
    byLesson: {},   // lessonId -> { completed: Set<challengeId>, exhausted: Set<challengeId> }

    markPassed: (lessonId, challengeId) => set((s) => add(s, lessonId, "completed", challengeId)),
    // All attempts used without a pass: the challenge no longer blocks the next lesson.
    markExhausted: (lessonId, challengeId) => set((s) => add(s, lessonId, "exhausted", challengeId)),
    reset: (lessonId) => set((s) => {
        if (!(lessonId in s.byLesson)) return s;
        const { [lessonId]: _removed, ...rest } = s.byLesson;
        return { byLesson: rest };
    }),
}));

/** Counts over the required challenge ids only; an exhausted challenge is resolved but not passed. */
export function progressFor(entry, requiredIds) {
    const passed = requiredIds.filter((id) => entry.completed.has(id)).length;
    const resolved = requiredIds.filter((id) => entry.completed.has(id) || entry.exhausted.has(id)).length;
    return { passed, resolved, total: requiredIds.length };
}
