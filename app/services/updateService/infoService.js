import { updateInfo } from "@/app/actions/patch/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function UpdateInfoService(data) {
    const { userId, nickname, surname, phone, name, email, bio, url } = data;

    const result = await updateInfo({ userId, nickname, surname, phone, name, email, bio, url });

    if (!result) {
        throw new ApiError("Failed to update your information, try again later", 500);
    }

    return true;
}