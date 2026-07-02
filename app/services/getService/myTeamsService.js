import { getMyTeams } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetMyTeamsService(data) {
    const { userId, search } = data;

    const result = await getMyTeams({ userId, search });

    if (!result) {
        throw new ApiError("Failed to get teams, try again later", 500);
    }

    return result;
}