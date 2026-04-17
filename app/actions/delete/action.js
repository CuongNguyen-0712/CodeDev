'use server'
import { sql } from '@/app/lib/db';

export async function deleteMyCourse(data) {
    const { userId, courseId } = data

    if (!(userId && courseId)) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const conditions = [];
        const params = [];

        params.push(userId);
        conditions.push(`user_id = $${params.length}`);

        params.push(courseId);
        conditions.push(`course_id = $${params.length}`);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `      
            UPDATE course.register 
            SET status = 'Cancelled'::status_course
            ${whereClause};
        `;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({
                status: 200,
                headers: { "Content-Type": "application/json" }
            }),
        );
    } catch (error) {
        console.error("Error deleting course:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function deleteMyProject(data) {
    const { userId, projectId } = data

    if (!(userId && projectId)) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
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
            ${whereClause};
        `;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({
                status: 200,
                headers: { "Content-Type": "application/json" }
            }),
        );
    } catch (error) {
        console.error("Error deleting project:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}