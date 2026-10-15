import { sql } from "@/lib/db";

export const feedbackDb = {
    // `sender` is the session user's public_id, or 'anonymous' (stored as NULL user_id).
    create: async ({ sender, title, feedback }) => {
        const params = [sender, title, feedback];
        const query = `
            INSERT INTO community.feedback (user_id, title, feedback)
            VALUES ((SELECT id FROM identity.users WHERE public_id = $1), $2, $3)
            RETURNING id;
        `;
        return await sql(query, params);
    }
};
