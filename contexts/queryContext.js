'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { QUERY_TIMES, retryTransient } from '@/lib/queryTimes'

export function QueryProvider({ children }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Queries without their own preset (queries/*.query.js) count as personal data.
                        ...QUERY_TIMES.personal,
                        retry: retryTransient,
                        refetchOnWindowFocus: false
                    }
                }
            })
    )

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}
