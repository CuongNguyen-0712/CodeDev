import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminService } from "@/services/admin.service";

// Every course (any publish status) with its metadata and prices + the taxonomy to edit them.
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, "admin.read");
        return adminService.listCourses();
    },
    { context: "api/admin/courses" }
);
