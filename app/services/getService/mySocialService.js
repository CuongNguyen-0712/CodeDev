
import { ApiError } from "@/app/lib/error/apiError";

export default async function GetMySocialService(data) {
    const { userId, tab, search } = data;

    const result = await getMySocial({ userId, tab, search });

    if (!result) {
        throw new ApiError(404, "Failed to fetch social data");
    }

    return result;
}