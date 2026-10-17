import { roadmapDb } from '@/db/roadmap'
import { redis } from '@/lib/cache'
import { cacheKeys, TTL, rememberForUser } from '@/lib/cacheKeys'
import { ApiError } from '@/lib/error/apiError'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const roadmapService = {
    // Same for every visitor and rarely edited: shared Redis cache.
    getList: async () => {
        return redis.remember(cacheKeys.roadmapList(), TTL.ROADMAP_LIST, async () => {
            const response = await roadmapDb.getList();

            if (!response) {
                throw new Error('Failed to fetch roadmap list, try again later');
            }

            return response.rows;
        });
    },

    getDetails: async ({ publicId, userId = null }) => {
        if (!publicId) {
            throw new ApiError('Roadmap ID is required', 400);
        }

        // roadmaps.public_id is a uuid: anything else can neither exist nor become a cache key.
        if (!UUID.test(publicId)) {
            throw new ApiError('Roadmap not found', 404);
        }

        // Guests share one entry; signed-in visitors see their own course progress, so their
        // entry is versioned and dropped with the rest of their cache on any progress change.
        const load = () => roadmapDb.getDetails(publicId, userId);
        const details = userId
            ? rememberForUser(userId, (v) => cacheKeys.userRoadmapDetails(userId, v, publicId), TTL.USER_ROADMAP_DETAILS, load)
            : redis.remember(cacheKeys.roadmapDetailsPublic(publicId), TTL.ROADMAP_DETAILS_PUBLIC, load, { cacheNull: true });

        const [roadmap, allRoadmaps] = await Promise.all([
            details,
            roadmapService.getList().catch(() => []),
        ]);

        if (!roadmap) {
            throw new ApiError('Roadmap not found', 404);
        }

        return {
            ...roadmap,
            allRoadmaps
        };
    }
}
