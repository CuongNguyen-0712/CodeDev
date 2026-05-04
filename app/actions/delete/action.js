'use server'
import { sql } from '@/app/lib/db';

export async function deleteMyCourse({ userId, courseId }) {
    const conditions = [];
    const params = [];

    params.push(userId);
    conditions.push(`user_id = $${params.length}`);

    params.push(courseId);
    conditions.push(`course_id = $${params.length}`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `      
            UPDATE course.register 
            SET is_deleted = true
            ${whereClause};
        `;

    return await sql.query(query, params);
}

export async function deleteMyProject({ userId, projectId }) {
    const conditions = [];
    const params = [];

    params.push(userId);
    conditions.push(`join_id = $${params.length}`);

    params.push(projectId);
    conditions.push(`project_id = $${params.length}`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `      
            UPDATE project.register 
            SET is_deleted = true
            ${whereClause}
        `;

    return await sql.query(query, params);
}