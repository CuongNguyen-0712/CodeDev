import { requirePermission } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { contentKpiService } from "@/services/contentKpi.service";

// GET /api/admin/content-kpis?course=<publicId> — challenge / statement / completion KPIs of one course.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "admin.read");
        const courseId = new URL(req.url).searchParams.get("course")?.trim() || "";
        if (!courseId || courseId.length > 200) throw new ApiError("course is required", 400);
        return contentKpiService.getCourseKpis(courseId);
    },
    { context: "api/admin/content-kpis" }
);
