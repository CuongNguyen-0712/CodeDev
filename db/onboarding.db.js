import { sql } from "@/lib/db";

/**
 * Onboarding state, learning preferences and the data the recommendation engine ranks.
 * Users are always addressed by identity.users.public_id taken from the session.
 */
export const onboardingDb = {
    /** Active taxonomy for the onboarding screens and the profile preferences form. */
    getCatalog: async () => {
        const query = `
            SELECT 'role' AS kind, code, name, description, sort_order FROM catalog.career_role WHERE is_active
            UNION ALL
            SELECT 'industry', code, name, description, sort_order FROM catalog.industry WHERE is_active
            UNION ALL
            SELECT 'goal', code, name, description, sort_order FROM catalog.learning_goal WHERE is_active
            ORDER BY kind, sort_order, name;
        `;
        return sql(query);
    },

    /** Programming languages that have at least one published course (optional preference). */
    getPreferenceLanguages: async () => {
        const query = `
            SELECT DISTINCT l.id, l.name
            FROM catalog.course c
            JOIN catalog.language l ON l.id = c.language_id
            WHERE c.publish_status = 'published' AND c.is_deleted = false
            ORDER BY l.name;
        `;
        return sql(query);
    },

    /** Onboarding row + preferences. The row exists for every user (trigger on identity.users). */
    getState: async ({ userId }) => {
        const query = `
            WITH u AS (SELECT id FROM identity.users WHERE public_id = $1)
            SELECT COALESCE(o.status, 'not_started') AS status,
                   COALESCE(o.current_step, 'role') AS current_step,
                   o.started_at, o.completed_at, o.skipped_at, o.updated_at,
                   r.code AS role_code, r.name AS role_name,
                   p.experience_level, p.preferred_language_id,
                   COALESCE((SELECT array_agg(i.code ORDER BY i.sort_order) FROM profile.user_industry ui
                             JOIN catalog.industry i ON i.id = ui.industry_id WHERE ui.user_id = u.id), '{}') AS industry_codes,
                   COALESCE((SELECT array_agg(g.code ORDER BY g.sort_order) FROM profile.user_learning_goal ug
                             JOIN catalog.learning_goal g ON g.id = ug.learning_goal_id WHERE ug.user_id = u.id), '{}') AS goal_codes
            FROM u
            LEFT JOIN profile.onboarding o ON o.user_id = u.id
            LEFT JOIN profile.learning_preference p ON p.user_id = u.id
            LEFT JOIN catalog.career_role r ON r.id = p.career_role_id;
        `;
        return sql(query, [userId]);
    },

    /**
     * Writes preferences (only the fields present) and moves the onboarding state, in one
     * transaction on `client`. Unknown / inactive codes raise CD400.
     * `nextState(previous)` returns `{ status, currentStep }` or null to leave the state alone.
     */
    savePreferences: async (client, { userId, prefs, nextState }) => {
        const userRes = await client.query(`SELECT u.id FROM identity.users u WHERE u.public_id = $1`, [userId]);
        const dbUserId = userRes.rows[0]?.id;
        if (!dbUserId) throw businessError("CD404", "User not found");

        // Row lock: concurrent saves of the same user (two tabs, double click) run one by one.
        await client.query(
            `INSERT INTO profile.onboarding (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );
        const current = await client.query(
            `SELECT status, current_step FROM profile.onboarding WHERE user_id = $1 FOR UPDATE`,
            [dbUserId]
        );

        await client.query(
            `INSERT INTO profile.learning_preference (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        if (prefs.roleCode !== undefined) {
            let roleId = null;
            if (prefs.roleCode !== null) {
                const role = await client.query(`SELECT id FROM catalog.career_role WHERE code = $1 AND is_active`, [prefs.roleCode]);
                roleId = role.rows[0]?.id;
                if (!roleId) throw businessError("CD400", "Unknown role");
            }
            await client.query(
                `UPDATE profile.learning_preference SET career_role_id = $2, updated_at = now() WHERE user_id = $1`,
                [dbUserId, roleId]
            );
        }

        if (prefs.experienceLevel !== undefined) {
            await client.query(
                `UPDATE profile.learning_preference SET experience_level = $2, updated_at = now() WHERE user_id = $1`,
                [dbUserId, prefs.experienceLevel]
            );
        }

        if (prefs.preferredLanguageId !== undefined) {
            if (prefs.preferredLanguageId !== null) {
                const lang = await client.query(`SELECT 1 FROM catalog.language WHERE id = $1`, [prefs.preferredLanguageId]);
                if (lang.rowCount === 0) throw businessError("CD400", "Unknown language");
            }
            await client.query(
                `UPDATE profile.learning_preference SET preferred_language_id = $2, updated_at = now() WHERE user_id = $1`,
                [dbUserId, prefs.preferredLanguageId]
            );
        }

        if (prefs.industryCodes !== undefined) {
            await replaceSet(client, dbUserId, prefs.industryCodes, SETS.industry);
        }

        if (prefs.goalCodes !== undefined) {
            await replaceSet(client, dbUserId, prefs.goalCodes, SETS.goal);
        }

        const previous = current.rows[0] || { status: "not_started", current_step: "role" };
        const next = nextState ? nextState(previous) : null;

        if (next) {
            await client.query(
                `UPDATE profile.onboarding
                 SET status = $2::varchar,
                     current_step = $3::varchar,
                     started_at = COALESCE(started_at, now()),
                     completed_at = CASE WHEN $2::varchar = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
                     updated_at = now()
                 WHERE user_id = $1`,
                [dbUserId, next.status, next.currentStep]
            );
        }

        return { previous, next };
    },

    /** Skip. Never downgrades a completed onboarding. */
    skip: async ({ userId }) => {
        const query = `
            UPDATE profile.onboarding o
            SET status = 'skipped', skipped_at = now(), updated_at = now()
            FROM identity.users u
            WHERE u.public_id = $1 AND o.user_id = u.id AND o.status <> 'completed'
            RETURNING o.status;
        `;
        return sql(query, [userId]);
    },

    /** Everything the ranking needs about the learner, in one round trip. */
    getLearnerProfile: async ({ userId }) => {
        const query = `
            WITH u AS (SELECT id FROM identity.users WHERE public_id = $1)
            SELECT
                r.code AS role_code,
                r.name AS role_name,
                p.experience_level,
                p.preferred_language_id,
                COALESCE((SELECT json_agg(json_build_object('code', s.code, 'name', s.name, 'weight', rs.weight))
                          FROM catalog.career_role_skill rs JOIN catalog.skill s ON s.id = rs.skill_id
                          WHERE rs.career_role_id = r.id AND s.is_active), '[]') AS role_skills,
                COALESCE((SELECT array_agg(i.code) FROM profile.user_industry ui
                          JOIN catalog.industry i ON i.id = ui.industry_id WHERE ui.user_id = u.id), '{}') AS industry_codes,
                COALESCE((SELECT array_agg(g.code) FROM profile.user_learning_goal ug
                          JOIN catalog.learning_goal g ON g.id = ug.learning_goal_id WHERE ug.user_id = u.id), '{}') AS goal_codes,
                COALESCE((SELECT json_agg(json_build_object('course_id', c.public_id, 'status', rg.status))
                          FROM learning.register rg JOIN catalog.course c ON c.id = rg.course_id
                          WHERE rg.user_id = u.id AND rg.is_deleted = false), '[]') AS enrolments,
                COALESCE((SELECT array_agg(c.public_id) FROM commerce.entitlement e
                          JOIN catalog.course c ON c.id = e.course_id
                          WHERE e.user_id = u.id AND e.status = 'active'
                            AND (e.expires_at IS NULL OR e.expires_at > now())), '{}') AS owned_course_ids
            FROM u
            LEFT JOIN profile.learning_preference p ON p.user_id = u.id
            LEFT JOIN catalog.career_role r ON r.id = p.career_role_id;
        `;
        return sql(query, [userId]);
    },

    /** Published courses with the metadata the recommendation rules use. Prices are not read. */
    getRecommendationCandidates: async () => {
        const query = `
            SELECT
                c.public_id AS id,
                c.title,
                c.image,
                c.level,
                c.rating,
                c.students,
                c.duration,
                c.modules,
                c.lessons,
                c.instructor,
                c.access_model,
                c.course_type,
                c.language_id,
                l.name AS language_name,
                l.logo AS language_logo,
                l.color AS language_color,
                cat.name AS category_name,
                (SELECT COUNT(*)::int FROM challenge.challenges ch
                 WHERE ch.course_id = c.id AND ch.is_deleted = false AND ch.is_published) AS challenges,
                COALESCE((SELECT json_agg(json_build_object('code', s.code, 'name', s.name, 'weight', cs.weight))
                          FROM catalog.course_skill cs JOIN catalog.skill s ON s.id = cs.skill_id
                          WHERE cs.course_id = c.id AND s.is_active), '[]') AS skills,
                COALESCE((SELECT array_agg(r.code) FROM catalog.course_career_role cr
                          JOIN catalog.career_role r ON r.id = cr.career_role_id WHERE cr.course_id = c.id), '{}') AS role_codes,
                COALESCE((SELECT array_agg(i.code) FROM catalog.course_industry ci
                          JOIN catalog.industry i ON i.id = ci.industry_id WHERE ci.course_id = c.id), '{}') AS industry_codes,
                COALESCE((SELECT array_agg(g.code) FROM catalog.course_learning_goal cg
                          JOIN catalog.learning_goal g ON g.id = cg.learning_goal_id WHERE cg.course_id = c.id), '{}') AS goal_codes,
                COALESCE((SELECT json_agg(json_build_object('id', pc.public_id, 'title', pc.title))
                          FROM catalog.course_prerequisite cp JOIN catalog.course pc ON pc.id = cp.prerequisite_course_id
                          WHERE cp.course_id = c.id), '[]') AS prerequisites,
                COALESCE((SELECT json_agg(DISTINCT jsonb_build_object('title', rm.title, 'role_code', rr.code))
                          FROM roadmap.node_course nc
                          JOIN roadmap.nodes n ON n.id = nc.node_id
                          JOIN roadmap.roadmaps rm ON rm.id = n.roadmap_id
                          LEFT JOIN catalog.career_role rr ON rr.id = rm.career_role_id
                          WHERE nc.course_id = c.id), '[]') AS roadmaps
            FROM catalog.course c
            JOIN catalog.language l ON l.id = c.language_id
            JOIN catalog.category cat ON cat.id = c.category_id
            WHERE c.publish_status = 'published' AND c.is_deleted = false
            ORDER BY c.id;
        `;
        return sql(query);
    },
};

// Fixed table / column names (never user input) for the multi-select preference sets.
const SETS = {
    industry: { taxonomy: "catalog.industry", table: "profile.user_industry", column: "industry_id", label: "industry" },
    goal: { taxonomy: "catalog.learning_goal", table: "profile.user_learning_goal", column: "learning_goal_id", label: "goal" },
};

function businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

async function replaceSet(client, userId, codes, { taxonomy, table, column, label }) {
    const found = await client.query(
        `SELECT id FROM ${taxonomy} WHERE code = ANY($1::varchar[]) AND is_active`,
        [codes]
    );
    if (found.rowCount !== codes.length) throw businessError("CD400", `Unknown ${label}`);

    await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    if (codes.length > 0) {
        await client.query(
            `INSERT INTO ${table} (user_id, ${column}) SELECT $1, unnest($2::int[])`,
            [userId, found.rows.map((row) => row.id)]
        );
    }
}
