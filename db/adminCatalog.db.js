import { sql } from "@/lib/db";

/**
 * Catalog reference data (docs/admin-panel-plan.md 03). Table and column names come from this
 * fixed map, never from input. `usage` counts the courses that reference a row.
 */
export const CATALOG_KINDS = {
    category: { table: "catalog.category", coded: false, usage: "SELECT COUNT(*) FROM catalog.course x WHERE x.category_id = t.id AND x.is_deleted IS NOT TRUE" },
    language: { table: "catalog.language", coded: false, usage: "SELECT COUNT(*) FROM catalog.course x WHERE x.language_id = t.id AND x.is_deleted IS NOT TRUE" },
    skill: { table: "catalog.skill", coded: true, usage: "SELECT COUNT(*) FROM catalog.course_skill x WHERE x.skill_id = t.id" },
    career_role: { table: "catalog.career_role", coded: true, usage: "SELECT COUNT(*) FROM catalog.course_career_role x WHERE x.career_role_id = t.id" },
    industry: { table: "catalog.industry", coded: true, usage: "SELECT COUNT(*) FROM catalog.course_industry x WHERE x.industry_id = t.id" },
    learning_goal: { table: "catalog.learning_goal", coded: true, usage: "SELECT COUNT(*) FROM catalog.course_learning_goal x WHERE x.learning_goal_id = t.id" },
};

const columns = (coded) => (coded ? "t.code, t.is_active" : "NULL AS code, TRUE AS is_active");

export const adminCatalogDb = {
    list: async ({ kind }) => {
        const { table, coded, usage } = CATALOG_KINDS[kind];
        return (await sql(
            `SELECT t.id::text AS id, t.name, ${columns(coded)}, (${usage})::int AS courses
             FROM ${table} t ORDER BY ${coded ? "t.is_active DESC, " : ""}t.name`
        )).rows;
    },

    lock: async (client, { kind, id }) => {
        const { table, coded, usage } = CATALOG_KINDS[kind];
        return (await client.query(
            `SELECT t.id::text AS id, t.name, ${columns(coded)}, (${usage})::int AS courses
             FROM ${table} t WHERE t.id = $1 FOR UPDATE OF t`,
            [id]
        )).rows[0] || null;
    },

    create: async (client, { kind, name, code }) => {
        const { table, coded } = CATALOG_KINDS[kind];
        return (await client.query(
            coded ? `INSERT INTO ${table} (name, code) VALUES ($1, $2) RETURNING id::text AS id` : `INSERT INTO ${table} (name) VALUES ($1) RETURNING id::text AS id`,
            coded ? [name, code] : [name]
        )).rows[0];
    },

    update: async (client, { kind, id, name, isActive }) => {
        const { table, coded } = CATALOG_KINDS[kind];
        await client.query(
            coded
                ? `UPDATE ${table} SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now() WHERE id = $1`
                : `UPDATE ${table} SET name = COALESCE($2, name), updated_at = now() WHERE id = $1`,
            coded ? [id, name ?? null, isActive ?? null] : [id, name ?? null]
        );
    },

    remove: async (client, { kind, id }) => client.query(`DELETE FROM ${CATALOG_KINDS[kind].table} WHERE id = $1`, [id]),
};
