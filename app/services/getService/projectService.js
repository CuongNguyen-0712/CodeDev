import { getProject } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetProjectService(data) {
    const { userId, search, limit, offset, methods, statuses, difficulties } = data;

    const result = await getProject({ userId, search, limit, offset, methods, statuses, difficulties });

    if (!result) {
        throw new ApiError("Failed to load projects, try again later", 500);
    }

    return result;
}