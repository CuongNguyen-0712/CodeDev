import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import UpdateLessonService from "@/app/services/updateService/lessonService";

export async function PATCH(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { courseId, lessonId } = await req.json();

        const data = { userId, courseId, lessonId };

        if (!courseId || !lessonId) {
            return NextResponse.json({ message: "You missing credentials" }, { status: 400 });
        }

        const response = await UpdateLessonService(data);

        return NextResponse.json({ success: response }, { status: response.status })
    }
    catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}