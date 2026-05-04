import { getInfo } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetInfoService(data) {
    const result = await getInfo(data);

    if (!result) {
        throw new ApiError("Failed to load info", 500);
    }

    return result;
}