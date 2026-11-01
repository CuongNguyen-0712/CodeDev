import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { publishChecklist } from "@/services/adminCourse.service";

/** Catalog and course structure admin (docs/admin-panel-plan.md 03). Throwaway rows only, restored after. */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ac${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const actor = { id: null };
const reason = "integration test";

describe("publish checklist", () => {
    it("warns about hidden-only content, missing content, tests and price", () => {
        const course = {
            access_model: "premium", active_offers: 0,
            modules: [{ hidden: false, lessons: [{ hidden: false, contentSource: null, codingWithoutTests: 2 }, { hidden: true, contentSource: null, codingWithoutTests: 5 }] }],
        };
        const byKey = Object.fromEntries(publishChecklist(course).map((item) => [item.key, item]));
        expect(byKey.modules.ok).toBe(true);
        expect(byKey.content).toMatchObject({ ok: false, label: "1 lesson has no content in the studio" });
        expect(byKey.tests).toMatchObject({ ok: false, label: "2 coding challenges have no test case" });
        expect(byKey.price.ok).toBe(false);
        expect(publishChecklist({ access_model: "free", active_offers: 0, modules: [] }).find((item) => item.key === "modules").ok).toBe(false);
    });
});

describe.skipIf(!hasDb)("catalog and structure (PostgreSQL)", () => {
    const created = [];

    afterAll(async () => {
        const { sql } = await import("@/lib/db");
        for (const [table, id] of created) await sql(`DELETE FROM ${table} WHERE id = $1`, [id]).catch(() => {});
    });

    it("creates, renames and deletes an unused category, and refuses a duplicate skill code", async () => {
        const { adminCatalogService } = await import("@/services/adminCatalog.service");
        const { id } = await adminCatalogService.create({ actor, kind: "category", name: `${TAG} category`, reason });
        created.push(["catalog.category", id]);
        const renamed = await adminCatalogService.update({ actor, kind: "category", id, name: `${TAG} renamed`, reason });
        expect(renamed.name).toBe(`${TAG} renamed`);
        expect(await adminCatalogService.remove({ actor, kind: "category", id, reason })).toEqual({ id, deleted: true });

        const skill = await adminCatalogService.create({ actor, kind: "skill", name: `${TAG} skill`, code: `${TAG}_skill`, reason });
        created.push(["catalog.skill", skill.id]);
        await expect(adminCatalogService.create({ actor, kind: "skill", name: "dup", code: `${TAG}_skill`, reason })).rejects.toMatchObject({ status: 409 });
        const off = await adminCatalogService.update({ actor, kind: "skill", id: skill.id, isActive: false, reason });
        expect(off.is_active).toBe(false);
    });

    it("refuses to delete a category courses use", async () => {
        const { sql } = await import("@/lib/db");
        const { adminCatalogService } = await import("@/services/adminCatalog.service");
        const used = (await sql(`SELECT category_id::text AS id FROM catalog.course WHERE category_id IS NOT NULL AND is_deleted IS NOT TRUE LIMIT 1`)).rows[0];
        if (!used) return;
        await expect(adminCatalogService.remove({ actor, kind: "category", id: used.id, reason })).rejects.toMatchObject({ status: 409 });
    });

    it("reads a course structure and moves / hides a lesson, then restores it", async () => {
        const { sql } = await import("@/lib/db");
        const { adminCourseService } = await import("@/services/adminCourse.service");
        const course = (await sql(
            `SELECT c.public_id FROM catalog.course c JOIN course.module m ON m.course_id = c.id
             WHERE c.is_deleted IS NOT TRUE AND (SELECT COUNT(*) FROM course.lesson l WHERE l.module_id = m.id AND l.is_deleted IS NOT TRUE) >= 2 LIMIT 1`
        )).rows[0];
        if (!course) return;
        const structure = await adminCourseService.structure({ courseId: course.public_id });
        expect(structure.checklist.length).toBe(5);
        const courseModule = structure.modules.find((m) => m.lessons.length >= 2);
        const [first, second] = courseModule.lessons;

        await adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: first.id, move: "down", reason });
        const moved = (await adminCourseService.structure({ courseId: course.public_id })).modules.find((m) => m.id === courseModule.id);
        expect(moved.lessons[0].id).toBe(second.id);
        await adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: first.id, move: "up", reason });
        await expect(adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: first.id, move: "up", reason })).rejects.toMatchObject({ status: 409 });

        await adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: first.id, hidden: !first.hidden, reason });
        await adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: first.id, hidden: first.hidden, reason });
        const restored = (await adminCourseService.structure({ courseId: course.public_id })).modules.find((m) => m.id === courseModule.id);
        expect(restored.lessons.map((l) => l.id)).toEqual(courseModule.lessons.map((l) => l.id));
        expect(restored.lessons[0].hidden).toBe(first.hidden);

        await expect(adminCourseService.changeItem({ actor, courseId: course.public_id, kind: "lesson", itemId: "1", hidden: true, reason })).rejects.toMatchObject({ status: 404 });
    });
});
