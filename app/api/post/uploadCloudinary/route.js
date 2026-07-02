import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import UploadService from "@/app/services/postService/uploadService";

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        const folder = formData.get("folder");

        if (!file || !file.type.startsWith("image/")) {
            throw new ApiError("Invalid file type", 400);
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new ApiError("File too large", 400);
        }

        const data = { file, folder };

        const url = await UploadService(data);

        return NextResponse.json({ success: true, data: url }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}
