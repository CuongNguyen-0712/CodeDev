import { roadmapClient } from '../clients/roadmap.client'

import { roadmapKeys } from '@/keys/roadmap.keys'
import { QUERY_TIMES } from '@/lib/queryTimes'

export const roadmapQueries = {
    // Same for every visitor, rarely edited.
    list() {
        return {
            queryKey: roadmapKeys.list(),
            queryFn: () => roadmapClient.getList(),
            ...QUERY_TIMES.reference,
        }
    },

    // Includes the signed-in learner's course progress; PROGRESS_UPDATED events invalidate it.
    details(id) {
        return {
            queryKey: roadmapKeys.details(id),
            queryFn: () => roadmapClient.getDetails(id),
            ...QUERY_TIMES.catalog,
        }
    }
}
