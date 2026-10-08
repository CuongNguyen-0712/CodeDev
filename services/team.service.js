import { teamDb } from "@/db/team.db";
import { ApiError } from "@/lib/error/apiError";
import { ulid } from "ulid";

export const teamService = {
    createTeam: async ({ userId, name, size, description }) => {
        if (!name?.trim() || !size) {
            throw new ApiError("Team name and size are required", 400);
        }

        const teamId = ulid();
        const result = await teamDb.createTeam({
            teamId,
            userId,
            name: name.trim(),
            size,
            description: description?.trim() || ""
        });

        if (!result) {
            throw new ApiError("Failed to create team, try again later", 500);
        }

        return true;
    },

    getMyTeams: async ({ userId, search }) => {
        const result = await teamDb.getMyTeams({ userId, search });

        if (!result) {
            throw new ApiError("Failed to get teams, try again later", 500);
        }

        return result.rows || result;
    },

    getTeamsSocial: async ({ userId, search, limit, offset }) => {
        const result = await teamDb.getTeamsSocial({ userId, search, limit, offset });

        if (!result) {
            throw new ApiError("Failed to load social teams, try again later", 500);
        }

        return result.rows || result;
    }
};

export default teamService;
