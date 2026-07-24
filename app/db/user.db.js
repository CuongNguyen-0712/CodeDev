import { sql } from "@/app/lib/db";

export const userDb = {
    signUp: async (data) => {
        const { id, public_id, surname, name, email, username, password } = data;

        const params = [];

        params.push(id, public_id, surname, name, email, username, password);

        const query = `call sign_up($1, $2, $3, $4, $5, $6, $7);`;

        return await sql.query(query, params);
    },

    login: async (data) => {
        const { username } = data;

        const params = [];

        params.push(username);

        const query = `select * from log_in($1);`;

        return await sql.query(query, params);
    },


    signUpWithProvider: async (data) => {
        const { id, public_id, username, email, image, accountProvider, providerAccountId } = data;

        const params = [];

        params.push(id, public_id, username, email, image, accountProvider, providerAccountId);

        const query = `SELECT * FROM auth_with_provider($1, $2, $3, $4, $5, $6, $7)`

        return await sql.query(query, params);
    },
    getPermissions: async (data) => {
        const { userId } = data;

        const params = [];

        params.push(userId);

        const query =
            `SELECT 
                distinct (p.resource || '.' || p.action) as permissions
            FROM private.permissions p
            JOIN private.role_permissions rp ON rp.permission_id = p.id 
            JOIN private.roles r ON rp.role_id = r.id
            JOIN private.user_roles ur ON r.id = ur.role_id
            JOIN private.users u ON u.id = ur.user_id
            WHERE u.public_id = $1`

        return await sql.query(query, params);
    },

    getMe: async (userId) => {
        const params = []
        const conditions = []

        params.push(userId)
        conditions.push(`i.user_id = (select id from private.users where public_id = $${params.length})`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            select 
                i.surname as surname,   
                i.name as name, 
                i.image as image, 
                i.bio as bio, 
                i.nickname as nickname, 
                i.rank as rank, 
                i.star as star, 
                i.level as level, 
                i.phone as phone,
                i.points as points,
                u.username as username, 
                u.email as email,
                u.email_verified as email_verified 
            from private.users u
            join private.info i on u.id = i.user_id
            ${whereSQL}
            limit 1
        `;

        return await sql.query(query, params);
    },

    getCourseProgress: async (data) => {
        const { userId, search, levels, statuses, markeds } = data;

        const params = []
        const conditions = []

        params.push(userId)
        conditions.push(`r.user_id = (select id from private.users where public_id = $${params.length})`)

        if (markeds && markeds.length > 0) {
            const markedArray = markeds.map(s => s.trim());

            if (markedArray.length == 1) {
                const isMarked = markedArray[0] === true || markedArray[0] === "true";
                params.push(isMarked);
                conditions.push(`r.is_marked = $${params.length}`);
            }
        }

        if (search) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(c.title) LIKE $${params.length}`);
        }

        if (statuses && statuses.length > 0) {
            const statusesArray = statuses.map(s => s.trim());
            params.push(statusesArray);
            conditions.push(`r.status = ANY($${params.length}::status_course_enum[])`);
        }

        if (levels && levels.length > 0) {
            const levelsArray = levels.map(l => l.trim());
            params.push(levelsArray);
            conditions.push(`c.level = ANY($${params.length}::level_enum[])`);
        }

        conditions.push(`r.is_deleted = false`)
        conditions.push(`c.is_hidden = false`)
        conditions.push(`c.is_deleted = false`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
        select 
            c.public_id as id,
            c.title,
            c.description,
            c.image,
            c.rating,
            c.modules,
            c.lessons,
            c.cost,
            c.level,
            c.concept,
            c.duration,
            c.instructor,
            c.points,
            c.reviews,
            c.duration,
            l.id as language_id,
            l.name as language_name,
            l.logo as language_logo,
            l.color as language_color,
            cat.name as category_name,
            r.progress AS progress,
            r.status AS status,
            coalesce(f.id, null) as is_favorite
        from public.course c
        join course.register r on r.course_id = c.id
        left join language l on c.language_id = l.id
        left join category cat on c.category_id = cat.id
        left join course.favorite f on f.course_id = c.id and f.user_id = (select id from private.users where public_id = $1)
        ${whereSQL}
    `;

        return await sql.query(query, params);
    },

    getLearningProgress: async (data) => {
        const { userId, courseId } = data;

        const params = []

        params.push(userId, courseId)
        const query = `select * from learning_progress($${params.length - 1}, $${params.length});`;

        return await sql.query(query, params);
    }
}