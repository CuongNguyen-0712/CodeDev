"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import PostCard from "@/components/blog/postCard";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

import { blogQueries } from "@/queries/blog.query";
import { retryTransient } from "@/lib/queryTimes";

// Posts after the server-rendered first page, appended below it.
export default function LoadMore({ tag, initialCursor }) {
    const query = useInfiniteQuery({ ...blogQueries.list(tag, initialCursor), retry: retryTransient });

    const pages = query.data?.pages || [];
    const items = pages.flatMap((page) => page.items);
    const hasMore = !query.data || query.hasNextPage;

    if (!initialCursor) return null;

    return (
        <>
            {items.length > 0 && (
                <div className="flex flex-col gap-4">
                    {pages.flatMap((page) => {
                        const pageIds = page.items.map((post) => post.id);
                        return page.items.map((post) => <PostCard key={post.id} post={post} pageIds={pageIds} />);
                    })}
                </div>
            )}
            {query.isError && (
                <p role="alert" className="text-sm text-destructive">Could not load more posts. Try again.</p>
            )}
            {hasMore && (
                <div className="flex justify-center">
                    <Button variant="outline" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>
                        {query.isFetching && <Spinner />}
                        Load more
                    </Button>
                </div>
            )}
        </>
    );
}
