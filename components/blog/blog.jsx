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

import { LuFileText, LuLibrary, LuNewspaper, LuPenLine } from "react-icons/lu";

function WriteActions({ stacked = false }) {
    return (
        <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
            <Button asChild>
                <Link href="/blog/new">
                    <LuPenLine />
                    Write a post
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/blog/me">
                    <LuFileText />
                    My posts
                </Link>
            </Button>
        </div>
    );
}

function TagNav({ tags, tag }) {
    return (
        <nav aria-label="Filter by topic">
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
    );
}

export default function Blog({ initial, tag }) {
    const items = initial?.items || [];
    const tags = [...new Set(items.flatMap((post) => post.tags || []))];
    if (tag && !tags.includes(tag)) tags.unshift(tag);
    const [lead, ...rest] = items;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-6 pb-12 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {tag ? `Posts about ${tag}` : "Blog"}
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground sm:text-base">
                    Knowledge and learning experience shared by CodeDev learners.
                </p>
            </header>

            {/* Below lg the sidebar's actions and topics sit above the list. */}
            <div className="flex flex-col gap-4 lg:hidden">
                <WriteActions />
                {tags.length > 0 && <TagNav tags={tags} tag={tag} />}
            </div>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="min-w-0">
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
                        <div className="flex flex-col gap-4">
                            <PostCard post={lead} featured />
                            {rest.length > 0 && (
                                <div className="divide-y border-b">
                                    {rest.map((post) => <PostCard key={post.id} post={post} />)}
                                </div>
                            )}
                            {/* Keyed by tag so a filter change starts from a fresh page list. */}
                            <LoadMore key={tag || "all"} tag={tag} initialCursor={initial.nextCursor} />
                        </div>
                    )}
                </div>

                <aside className="hidden lg:block" aria-label="Write and browse topics">
                    <div className="sticky top-20 flex flex-col gap-8">
                        <WriteActions stacked />
                        {tags.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <h2 className="text-sm font-semibold text-foreground">Topics</h2>
                                <TagNav tags={tags} tag={tag} />
                            </section>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
