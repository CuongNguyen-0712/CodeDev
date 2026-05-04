import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UpdateInfoService from "@/app/services/updateService/infoService";
import UploadService from "@/app/services/postService/uploadService";

export async function PATCH(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { nickname, surname, phone, name, email, image, bio } = await req.json();

        const isUpdate =
            nickname ||
            surname ||
            phone ||
            name ||
            email ||
            image ||
            bio;

        if (!isUpdate) {
            throw new ApiError("No data to update", 400);
        }

        let imageUrl = null;

        if (image) {
            imageUrl = await UploadService(image, "uploads");

            if (!imageUrl) {
                throw new ApiError("Failed to upload image, try again later", 500);
            }
        }

        const data = {
            userId,
            nickname,
            surname,
            phone,
            name,
            email,
            bio,
            ...(imageUrl && { url: imageUrl })
        };

        const response = await UpdateInfoService(data);

        if (!response) {
            throw new ApiError("Failed to update info", 500);
        }

        return NextResponse.json(
            {
                success: true,
                message: "Updated successfully",
                data: response
            },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error.message || "Internal Server Error"
            },
            { status: error.status || 500 }
        );
    }
}