import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { onboardingService } from "@/services/onboarding.service";

// Roles, industries, goals, levels, languages: reference data from the database (public).
export async function GET() {
    try {
        const data = await onboardingService.getCatalog();
        return NextResponse.json({ success: true, data }, {
            headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" },
        });
    } catch (error) {
        return errorResponse(error, "api/onboarding/catalog");
    }
}
