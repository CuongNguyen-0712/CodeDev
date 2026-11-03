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
    // `scope`: "public" is the guest view the page renders on the server (ISR, same for everyone);
    // "viewer" is the signed-in learner's own copy, fetched in the browser.
    details(id, scope = "public") {
        return {
            queryKey: [...roadmapKeys.details(id), scope],
            queryFn: () => roadmapClient.getDetails(id),
            ...QUERY_TIMES.catalog,
        }
    }
}
