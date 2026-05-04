import { deleteMyProject } from "@/app/actions/delete/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function DeleteMyProjectService(data) {
    const { userId, projectId } = data;

    const result = await deleteMyProject({ userId, projectId });

    if (!result) {
        throw new ApiError("Failed to delete project", 500);
    }

    return true;
}