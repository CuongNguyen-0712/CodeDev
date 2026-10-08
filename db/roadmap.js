import { sql } from '@/lib/db'

export const roadmapDb = {
    getList: async () => {
        const params = []
        const query = `
            SELECT
                r.public_id AS id,
                r.title AS title,
                r.description AS description,
                r.level AS level,
                COUNT(DISTINCT n.id) AS nodes,
                COALESCE(
                    jsonb_agg(
                        DISTINCT jsonb_build_object(
                            'name', l.name,
                            'id', l.id,
                            'logo', l.logo,
                            'color', l.color
                        )
                    ),
                    '[]'::jsonb
                ) AS languages
            FROM public.roadmaps r
            LEFT JOIN roadmap.nodes n ON n.roadmap_id = r.id
            LEFT JOIN roadmap.node_course nc ON nc.node_id = n.id
            LEFT JOIN public.course c ON c.id = nc.course_id
            LEFT JOIN public.language l ON c.language_id = l.id
            GROUP BY r.id;
        `

        return await sql(query, params)
    },

    getDetails: async (publicId, userId = null) => {
        const roadmapQuery = `
            SELECT
                r.id,
                r.public_id,
                r.title,
                r.description,
                r.level,
                r.created_at
            FROM public.roadmaps r
            WHERE r.public_id = $1
            LIMIT 1
        `;
        const roadmapResult = await sql(roadmapQuery, [publicId]);
        if (!roadmapResult.rows || roadmapResult.rows.length === 0) {
            return null;
        }
        const roadmap = roadmapResult.rows[0];

        const nodesQuery = `
            SELECT 
                n.id,
                n.title,
                n.description,
                n.order_index,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', c.public_id,
                            'title', c.title,
                            'image', c.image,
                            'rating', c.rating,
                            'lessons', c.lessons,
                            'progress', COALESCE(r.progress, 0),
                            'cost', c.cost,
                            'logo', l.logo,
                            'color', l.color,
                            'language', l.name,
                            'category', cat.name,
                            'reward', c.reward,
                            'priority', nc.priority
                        ) ORDER BY nc.priority ASC
                    ) FILTER (WHERE c.id IS NOT NULL),
                    '[]'
                ) AS courses
            FROM roadmap.nodes n
            LEFT JOIN roadmap.node_course nc ON nc.node_id = n.id
            LEFT JOIN public.course c ON c.id = nc.course_id
            LEFT JOIN public.language l ON c.language_id = l.id
            LEFT JOIN public.category cat ON c.category_id = cat.id
            LEFT JOIN course.register r ON r.course_id = c.id 
                ${userId ? `AND r.user_id = (SELECT id FROM private.users WHERE public_id = $2)` : `AND 1 = 0`}
                AND r.is_deleted = false
            WHERE n.roadmap_id = $1
            GROUP BY n.id, n.title, n.description, n.order_index
            ORDER BY n.order_index ASC
        `;

        const nodesParams = userId ? [roadmap.id, userId] : [roadmap.id];
        const nodesResult = await sql(nodesQuery, nodesParams);

        return {
            ...roadmap,
            nodes: nodesResult.rows || []
        };
    },

    getRoadmapById: async ({ roadmapId }) => {
        const params = [];
        const conditions = [];

        if (roadmapId) {
            params.push(roadmapId);
            conditions.push(`r.id = $${params.length}`);
        }

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT
                r.public_id as id,
                r.title as title,
                r.description as description,
                COUNT(n.id) nodes
            FROM public.roadmaps r
            JOIN roadmap.nodes n ON n.roadmap_id = r.id
            GROUP BY r.id
            ${whereSQL}
        `;

        return await sql(query, params);
    },

    getRoadmapNodes: async ({ userId, roadmapId }) => {
        const params = [];
        const conditions = [];

        params.push(userId, roadmapId);
        conditions.push(`n.roadmap_id = (select id from public.roadmaps where public_id = $${params.length})`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                n.id,
                n.title,
                n.description,
                n.order_index,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', c.public_id,
                            'title', c.title,
                            'image', c.image,
                            'rating', c.rating,
                            'lessons', c.lessons,
                            'progress', COALESCE(r.progress, 0),
                            'cost', c.cost,
                            'logo', l.logo,
                            'color', l.color,
                            'language', l.name,
                            'category', cat.name,
                            'reward', c.reward,
                            'priority', nc.priority
                        ) ORDER BY nc.priority ASC
                    ) FILTER (WHERE c.id IS NOT NULL),
                    '[]'
                ) AS courses
            FROM roadmap.nodes n
            LEFT JOIN roadmap.node_course nc ON nc.node_id = n.id
            LEFT JOIN public.course c ON c.id = nc.course_id
            LEFT JOIN public.language l ON c.language_id = l.id
            LEFT JOIN public.category cat ON c.category_id = cat.id
            LEFT JOIN course.register r ON r.course_id = c.id AND r.user_id = (select id from private.users where public_id = $1) AND r.is_deleted = false
            ${whereSQL}
            GROUP BY n.id, n.title, n.description, n.order_index
            ORDER BY n.order_index ASC
        `;

        return await sql(query, params);
    }
}        