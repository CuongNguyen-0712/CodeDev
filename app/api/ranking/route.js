import { apiRoute } from "@/lib/routeHandler";
import { parseRankingQuery } from "@/lib/ranking";
import { rankingService } from "@/services/ranking.service";

// ?board=overall|exp|points&period=all|30d (unknown values fall back to overall / all).
export const GET = apiRoute(
    ({ req, userId }) => {
        const { board, period } = parseRankingQuery(new URL(req.url).searchParams);
        return rankingService.getBoard({ userId, board, period });
    },
    { context: "api/ranking" }
);
