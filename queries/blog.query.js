import { blogClient } from "../clients/blog.client";

import { blogKeys } from "@/keys/blog.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

export const blogQueries = {
    // Pages after the server-rendered first one: `initialCursor` is that page's nextCursor.
    list(tag, initialCursor) {
        return {
            queryKey: blogKeys.list(tag),
            initialPageParam: initialCursor,
            queryFn: ({ pageParam }) =>
                blogClient.getList({
                    ...(tag ? { tag } : {}),
                    cursor: pageParam,
                }),
            getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
            // Runs only on "Load more"; the first page is already on screen.
            enabled: false,
            ...QUERY_TIMES.catalog,
        };
    },
}
