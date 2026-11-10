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
                    <LuPenLine aria-hidden="true" />
                    Write a post
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/blog/me">
                    <LuFileText aria-hidden="true" />
                    My posts
                </Link>
            </Button>
        </div>
    );
}

// Filter pills: 32px tall, a control and not a label.
const PILL = "h-8 px-3 text-sm";

// `scroll` (below lg): one row that scrolls sideways, so the topics never push the first post down.
function TagNav({ tags, tag, scroll = false }) {
    return (
        <nav aria-label="Filter by topic">
            <ul className={scroll
                ? "-mx-4 flex list-none flex-nowrap gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] *:shrink-0 sm:-mx-6 sm:px-6"
                : "flex list-none flex-wrap gap-2 p-0"}
            >
                <li>
                    <Badge asChild variant={tag ? "outline" : "primary"} className={PILL}>
                        <Link href="/blog" aria-current={tag ? undefined : "page"}>All posts</Link>
                    </Badge>
                </li>
                {tags.map((name) => (
                    <li key={name}>
                        <Badge asChild variant={name === tag ? "primary" : "outline"} className={PILL}>
                            <Link href={`/blog?tag=${encodeURIComponent(name)}`} aria-current={name === tag ? "page" : undefined}>
                                {name}
                            </Link>
                        </Badge>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export default function Blog({ initial, tag, topics = [] }) {
    const items = initial?.items || [];
    // `topics` are the most used tags of all published posts; the active tag leads when it is not one of them.
    const tags = tag && !topics.includes(tag) ? [tag, ...topics] : topics;
    const pageIds = items.map((post) => post.id);

    return (
        // The shell frame Course and Roadmap use; the feed column stays 48rem so covers do not grow huge.
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
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
                {tags.length > 0 && <TagNav tags={tags} tag={tag} scroll />}
            </div>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,48rem)_15rem] lg:justify-between">
                <div className="min-w-0">
                    {items.length === 0 ? (
                        <Empty className="border">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <LuNewspaper aria-hidden="true" />
                                </EmptyMedia>
                                <EmptyTitle>
                                    <h2 className="text-lg font-medium tracking-tight">{tag ? `No posts about ${tag}` : "No posts yet"}</h2>
                                </EmptyTitle>
                                <EmptyDescription>
                                    {tag ? "Nobody has written about this topic yet." : "Be the first to share what you learned."}
                                </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent className="flex-row flex-wrap justify-center">
                                {tag ? (
                                    <Button asChild variant="outline">
                                        <Link href="/blog">All posts</Link>
                                    </Button>
                                ) : (
                                    <>
                                        <Button asChild>
                                            <Link href="/blog/new">
                                                <LuPenLine aria-hidden="true" />
                                                Write a post
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline">
                                            <Link href="/course">
                                                <LuLibrary aria-hidden="true" />
                                                Browse courses
                                            </Link>
                                        </Button>
                                    </>
                                )}
                            </EmptyContent>
                        </Empty>
                    ) : (
                        // One gap for every card, across the server page and the loaded ones.
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-4">
                                {items.map((post) => <PostCard key={post.id} post={post} pageIds={pageIds} />)}
                            </div>
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
