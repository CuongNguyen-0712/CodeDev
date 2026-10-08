import cloudinary from "@/lib/cloudinary";
import { ApiError } from "@/lib/error/apiError";

export const uploadService = {
    uploadImage: async ({ file, folder = "uploads" }) => {
        if (!file || typeof file === "string" || !file.type?.startsWith("image/")) {
            throw new ApiError("Invalid file type. Only image files are permitted.", 400);
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new ApiError("File size exceeds 5MB limit", 400);
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUri = `data:${file.type};base64,${base64}`;

        const result = await cloudinary.uploader.upload(dataUri, { folder });

        if (!result || !result.secure_url) {
            throw new ApiError("Failed to upload image, try again later", 500);
        }

        return result.secure_url;
    }
};

export default uploadService;
