import { sql } from '@/app/lib/db'

export const roadmapDb = {
    getList: async () => {
        const params = []
        const query = `
            SELECT
                r.public_id as id,
                r.title as title,
                r.description as description,
                COUNT(n.id) nodes
            FROM public.roadmaps r
            JOIN roadmap.nodes n ON n.roadmap_id = r.id
            GROUP BY r.id
        `

        return await sql.query(query, params)
    }
}        