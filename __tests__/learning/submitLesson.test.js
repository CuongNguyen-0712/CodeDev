// UX-101: completing a lesson must resolve to the rewards object itself, so the lesson footer can
// show "+N points · +N EXP" and "Course completed" (it read a { success, data } wrapper before).
import { describe, expect, it, vi, beforeEach } from "vitest";

const submitLessonAction = vi.fn();

// useMutation returns its options, so the test can call mutationFn directly without React.
vi.mock("@tanstack/react-query", () => ({
    useMutation: (options) => options,
    useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn(), cancelQueries: vi.fn() }),
}));

vi.mock("@/actions/course.actions", () => ({
    registerCourseAction: vi.fn(),
    withdrawCourseAction: vi.fn(),
    submitLessonAction: (...args) => submitLessonAction(...args),
    favoriteCourseAction: vi.fn(),
    unfavoriteCourseAction: vi.fn(),
    postCommentAction: vi.fn(),
    voteCommentAction: vi.fn(),
}));

const { useCourseSubmitLesson } = await import("@/mutations/course.mutation");

describe("useCourseSubmitLesson", () => {
    beforeEach(() => submitLessonAction.mockReset());

    it("resolves to the rewards, not the action wrapper", async () => {
        const rewards = { awardedPoints: 10, awardedExp: 10, courseCompleted: true, level: 2, previousLevel: 1 };
        submitLessonAction.mockResolvedValue({ success: true, data: rewards });

        const result = await useCourseSubmitLesson().mutationFn({ courseId: "c1", lessonId: "l1" });

        expect(result).toEqual(rewards);
        expect(result.courseCompleted).toBe(true);
        expect(submitLessonAction).toHaveBeenCalledWith({ courseId: "c1", lessonId: "l1" });
    });

    it("throws the server error with its status", async () => {
        submitLessonAction.mockResolvedValue({ success: false, status: 403, message: "Pass every challenge first" });

        await expect(useCourseSubmitLesson().mutationFn({ courseId: "c1", lessonId: "l1" }))
            .rejects.toMatchObject({ status: 403, message: "Pass every challenge first" });
    });
});
