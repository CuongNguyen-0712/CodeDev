import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";

import { courseService } from "@/services/course.service";

/** Languages / categories that have visible courses, for the catalog filter panel. */
export async function GET() {
    try {
        const response = await courseService.getFilterOptions();

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/filters");
    }
}
