import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UploadService from "@/app/services/postService/uploadService";

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large" }, { status: 400 });
        }

        const url = await UploadService(file, "uploads");

        return NextResponse.json({ success: true, data: url }, { status: 200 });
    } catch (error) {

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}
