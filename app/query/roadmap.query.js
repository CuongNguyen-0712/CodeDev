import { roadmapClient } from '../clients/roadmap.client'

import { roadmapKeys } from '@/app/keys/roadmap.keys'

export const roadmapQueries = {
    list() {
        return {
            queryKey: roadmapKeys.list(),
            queryFn: () => roadmapClient.getList(),
            staleTime: 1000 * 60 * 5, // 5 minutes
            cacheTime: 1000 * 60 * 10, // 10 minutes
        }
    },

    details(id) {
        return {
            queryKey: roadmapKeys.details(id),
            queryFn: () => roadmapClient.getDetails(id),
            staleTime: 0,
            cacheTime: 1000 * 60,
            gcTime: 1000 * 60,
            refetchOnWindowFocus: true,
        }
    }
}

