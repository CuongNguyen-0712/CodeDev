import { adminDb } from "@/db/admin.db";
import { adminCourseDb } from "@/db/adminCourse.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { dropCatalogCaches } from "@/services/admin.service";

/**
 * Publish checklist (docs/admin-panel-plan.md 03): warnings, never a block. Each item is
 * { key, ok, label } so the screen can say what is missing in words.
 */
export function publishChecklist(course) {
    const modules = course.modules.filter((module) => !module.hidden);
    const lessons = modules.flatMap((module) => module.lessons.filter((lesson) => !lesson.hidden));
    const withoutContent = lessons.filter((lesson) => !lesson.contentSource).length;
    const codingWithoutTests = lessons.reduce((sum, lesson) => sum + lesson.codingWithoutTests, 0);
    return [
        { key: "modules", ok: modules.length > 0, label: modules.length ? `${modules.length} visible module${modules.length === 1 ? "" : "s"}` : "No visible module" },
        { key: "lessons", ok: lessons.length > 0, label: lessons.length ? `${lessons.length} visible lesson${lessons.length === 1 ? "" : "s"}` : "No visible lesson" },
        { key: "content", ok: withoutContent === 0, label: withoutContent ? `${withoutContent} lesson${withoutContent === 1 ? " has" : "s have"} no content in the studio` : "Every lesson has content" },
        { key: "tests", ok: codingWithoutTests === 0, label: codingWithoutTests ? `${codingWithoutTests} coding challenge${codingWithoutTests === 1 ? " has" : "s have"} no test case` : "Every coding challenge has test cases" },
        { key: "price", ok: course.access_model !== "premium" || course.active_offers > 0, label: course.access_model !== "premium" ? "Free course" : course.active_offers ? "Premium with an active price" : "Premium without an active price" },
    ];
}

export const adminCourseService = {
    structure: async ({ courseId }) => {
        const course = await adminCourseDb.structure({ coursePublicId: courseId });
        if (!course) throw new ApiError("Course not found", 404);
        return { ...course, checklist: publishChecklist(course) };
    },

    /** Hide / show or move one module or lesson; audited, catalog caches dropped. */
    changeItem: async ({ actor, courseId, kind, itemId, hidden, move, reason, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const item = await adminCourseDb.lockItem(client, { kind, itemId, coursePublicId: courseId });
            if (!item) throw new ApiError(`${kind === "module" ? "Module" : "Lesson"} not found in this course`, 404);

            let action;
            if (move) {
                const other = await adminCourseDb.neighbour(client, { kind, item, direction: move });
                if (!other) throw new ApiError(`Already the ${move === "up" ? "first" : "last"} one`, 409);
                await adminCourseDb.swapOrder(client, { kind, a: item, b: other });
                action = `${kind}.move`;
            } else {
                await adminCourseDb.setHidden(client, { kind, itemId, hidden });
                action = `${kind}.${hidden ? "hide" : "show"}`;
            }
            await adminDb.audit(client, {
                actorId: actor.id, action, targetType: kind, targetId: itemId, reason, ip,
                before: { title: item.title, order: item.order_index, hidden: item.is_hidden },
                after: move ? { move } : { hidden },
            });
            return { id: itemId, kind, action };
        });
        await dropCatalogCaches(courseId);
        return result;
    },
};
