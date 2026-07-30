import { roadmapDb } from '@/app/db/roadmap'

export const roadmapService = {
    getList: async () => {
        const response = await roadmapDb.getList();

        if (!response) {
            throw new Error('Failed to fetch roadmap list, try again later');
        }

        return response;
    }
}