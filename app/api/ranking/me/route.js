import { apiRoute } from "@/lib/routeHandler";
import { rankingService } from "@/services/ranking.service";

// The caller's all-time tier and position on every board (home card, own profile).
export const GET = apiRoute(
    ({ userId }) => rankingService.getRanks(userId),
    { context: "api/ranking/me" }
);
