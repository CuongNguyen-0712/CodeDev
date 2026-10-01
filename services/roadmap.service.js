import { roadmapDb } from '@/db/roadmap'

export const roadmapService = {
    getList: async () => {
        const response = await roadmapDb.getList();

        if (!response) {
            throw new Error('Failed to fetch roadmap list, try again later');
        }

        return response.rows;
    },

    getDetails: async ({ publicId, userId = null }) => {
        if (!publicId) {
            throw new Error('Roadmap ID is required');
        }

        const roadmap = await roadmapDb.getDetails(publicId, userId);
        if (!roadmap) {
            throw new Error('Roadmap not found');
        }

        const listRes = await roadmapDb.getList();
        const allRoadmaps = listRes ? listRes.rows : [];

        return {
            ...roadmap,
            allRoadmaps
        };
    }
}