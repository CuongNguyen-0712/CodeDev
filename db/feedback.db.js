import { sql } from "@/lib/db";

export const feedbackDb = {
    create: async ({ sender, title, feedback }) => {
        const params = [sender, title, feedback];
        const query = `
            INSERT INTO public.feedback (sender, title, feedback) 
            VALUES ($1, $2, $3)
            RETURNING id;
        `;
        return await sql(query, params);
    }
};
