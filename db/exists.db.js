import { sql } from "@/lib/db";

/**
 * "Does this public page's id exist" queries, kept apart from the full db modules because
 * proxy.js runs them on every page request (lib/pageExistence): the proxy bundle then carries
 * only these three statements, not the catalog, profile and roadmap query sets.
 */
export const existsDb = {
    /** Not deleted, published or not: owners still open an unpublished course. */
    course: async (courseId) => {
        return sql(`SELECT 1 FROM catalog.course WHERE public_id = $1 AND is_deleted = false`, [courseId]);
    },

    roadmap: async (publicId) => {
        return sql(`SELECT 1 FROM roadmap.roadmaps WHERE public_id = $1 LIMIT 1`, [publicId]);
    },

    /** Same visibility rule as profileDb.getPublicProfile, without the profile itself. */
    publicProfile: async (key) => {
        return sql(
            `SELECT 1 FROM identity.users u JOIN profile.info i ON i.user_id = u.id
             WHERE (u.username = $1 OR u.public_id = $1) AND u.status = 'active' AND i.show_profile
             LIMIT 1`,
            [key]
        );
    },
};
