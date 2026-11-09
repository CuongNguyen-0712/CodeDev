import Link from "next/link";

import LoadMore from "@/components/blog/loadMore";
import PostCard from "@/components/blog/postCard";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/shadcn/empty";

import { LuLibrary, LuNewspaper, LuPenLine } from "react-icons/lu";

export default function Blog({ initial, tag }) {
    const items = initial?.items || [];
    const tags = [...new Set(items.flatMap((post) => post.tags || []))];
    if (tag && !tags.includes(tag)) tags.unshift(tag);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Blog
                    </h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Articles about programming, learning to code and updates to CodeDev.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/blog/new">
                        <LuPenLine />
                        Write a post
                    </Link>
                </Button>
            </header>

            {tags.length > 0 && (
                <nav aria-label="Filter by tag">
                    <ul className="flex list-none flex-wrap gap-2 p-0">
                        <li>
                            <Badge asChild variant={tag ? "outline" : "primary"}>
                                <Link href="/blog" aria-current={tag ? undefined : "true"}>All posts</Link>
                            </Badge>
                        </li>
                        {tags.map((name) => (
                            <li key={name}>
                                <Badge asChild variant={name === tag ? "primary" : "outline"}>
                                    <Link href={`/blog?tag=${encodeURIComponent(name)}`} aria-current={name === tag ? "true" : undefined}>
                                        {name}
                                    </Link>
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}

            {items.length === 0 ? (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <LuNewspaper aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>
                            <h2 className="text-lg font-medium tracking-tight">No articles yet</h2>
                        </EmptyTitle>
                        <EmptyDescription>
                            The first posts are being written. In the meantime, the courses are the best place to start learning.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button asChild>
                            <Link href="/course">
                                <LuLibrary />
                                Browse courses
                            </Link>
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((post) => <PostCard key={post.id} post={post} />)}
                    </div>
                    {/* Keyed by tag so a filter change starts from a fresh page list. */}
                    <LoadMore key={tag || "all"} tag={tag} initialCursor={initial.nextCursor} />
                </>
            )}
        </div>
    );
}
