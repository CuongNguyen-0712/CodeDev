import { roadmapDb } from '@/db/roadmap'
import { redis } from '@/lib/cache'
import { cacheKeys, TTL } from '@/lib/cacheKeys'
import { ApiError } from '@/lib/error/apiError'

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

        const [roadmap, allRoadmaps] = await Promise.all([
            roadmapDb.getDetails(publicId, userId),
            roadmapService.getList().catch(() => []),
        ]);

        if (!roadmap) {
            throw new ApiError('Roadmap not found', 404);
        }

        return {
            ...roadmap,
            allRoadmaps
        };
    },

    getRoadmap: async ({ roadmapId }) => {
        const response = await roadmapDb.getRoadmapById({ roadmapId });

        if (!response) {
            throw new Error('Failed to load roadmap, try again later');
        }

        return response.rows || response;
    },

    getRoadmapNodes: async ({ userId, roadmapId }) => {
        const response = await roadmapDb.getRoadmapNodes({ userId, roadmapId });

        if (!response) {
            throw new Error('Failed to load roadmap nodes, try again later');
        }

        return response.rows || response;
    }
}