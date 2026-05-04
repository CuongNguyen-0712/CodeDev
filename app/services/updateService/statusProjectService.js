import { updateStatusProject } from "@/app/actions/patch/action";
import { ApiError } from "@/app/lib/error/apiError";

export default async function UpdateStatusProjectService(data) {
    const { userId, projectId, is_marked, is_deleted } = data;
    const result = await updateStatusProject({ userId, projectId, is_marked, is_deleted });

    if (!result) {
        throw new ApiError("Failed to update project: ", 500);
    }

    return result
}