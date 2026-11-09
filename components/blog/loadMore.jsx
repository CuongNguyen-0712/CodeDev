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

    const items = (query.data?.pages || []).flatMap((page) => page.items);
    const hasMore = !query.data || query.hasNextPage;

    if (!initialCursor) return null;

    return (
        <>
            {items.length > 0 && (
                <div className="divide-y border-b">
                    {items.map((post) => <PostCard key={post.id} post={post} />)}
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
