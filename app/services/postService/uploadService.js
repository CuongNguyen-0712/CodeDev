import cloudinary from "@/app/lib/cloudinary";

import { ApiError } from "@/app/lib/error/apiError";

export default async function UploadService(file, folder) {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUri = `data:${file.type};base64,${base64}`;
    const result = await cloudinary.uploader.upload(dataUri, { folder });

    if (!result) {
        throw new ApiError("Failed to upload, try again later", 500)
    }

    return result.secure_url;
}