import { socialDb } from "@/db/social.db";
import { ApiError } from "@/lib/error/apiError";

export const socialService = {
    getUsersSocial: async ({ userId, search, limit = 10, offset = 0 }) => {
        const result = await socialDb.getUsersSocial({ userId, search, limit, offset });

        if (!result) {
            throw new ApiError("Failed to load user social data, try again later", 500);
        }

        return result.rows || result;
    }
};

export default socialService;
