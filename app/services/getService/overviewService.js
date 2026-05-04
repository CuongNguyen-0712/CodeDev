import { getOverview } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetOverviewService(data) {
    const result = await getOverview(data);

    if (!result) {
        throw new ApiError(404, "Failed to load overview");
    }

    return result;
}