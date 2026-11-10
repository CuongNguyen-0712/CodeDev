import Link from "next/link";

import { SignedIn } from "@/components/auth/signedIn";
import LoadMore from "@/components/blog/loadMore";
import PostCard from "@/components/blog/postCard";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/shadcn/empty";

import { LuFileText, LuLibrary, LuNewspaper, LuPenLine } from "react-icons/lu";

// The sidebar's first card: why to write, then the two actions. Signed-in readers only (see Blog).
function WriteCard() {
    return (
        <section aria-labelledby="blog-write-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="space-y-1">
                <h2 id="blog-write-heading" className="text-sm font-semibold text-foreground">Share what you learned</h2>
                <p className="text-sm text-muted-foreground">A reviewed post earns EXP and points.</p>
            </div>
            <WriteActions />
        </section>
    );
}

function WriteActions() {
    return (
        <div className="flex flex-col gap-2">
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

// Filter pills: 32px tall, a control and not a label. The current one is solid violet: the soft tint
// read as one more outline pill in dark mode.
const PILL = "h-8 gap-1.5 px-3 text-sm";
// The Badge's own hover sets accent text; the current pill keeps white text on its darker hover.
const PILL_ON = "border-primary bg-primary text-primary-foreground dark:text-white [a&]:hover:bg-primary-hover [a&]:hover:text-primary-foreground dark:[a&]:hover:text-white";
const PILL_OFF = "bg-background text-foreground [a&]:hover:border-primary/40 [a&]:hover:bg-primary-soft";

function TopicPill({ href, current, children, count }) {
    return (
        <Badge asChild variant="outline" className={`${PILL} ${current ? PILL_ON : PILL_OFF}`}>
            <Link href={href} aria-current={current ? "page" : undefined}>
                {children}
                {count != null && (
                    <span className={`text-xs tabular-nums ${current ? "opacity-80" : "text-muted-foreground"}`}>
                        {count}<span className="sr-only"> {count === 1 ? "post" : "posts"}</span>
                    </span>
                )}
            </Link>
        </Badge>
    );
}

// `scroll` (below lg): one row that scrolls sideways, so the topics never push the first post down.
function TagNav({ tags, tag, scroll = false }) {
    return (
        <nav aria-label="Filter by topic">
            <ul className={scroll
                ? "-mx-4 flex list-none flex-nowrap gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] *:shrink-0 sm:-mx-6 sm:px-6"
                : "flex list-none flex-wrap gap-2 p-0"}
            >
                <li>
                    <TopicPill href="/blog" current={!tag}>All posts</TopicPill>
                </li>
                {tags.map(({ name, posts }) => (
                    <li key={name}>
                        <TopicPill href={`/blog?tag=${encodeURIComponent(name)}`} current={name === tag} count={posts}>
                            {name}
                        </TopicPill>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

// The page frame, shared by the feed and its loading state so the skeleton lines up with it.
const FRAME = "@container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10";
const COLUMNS = "grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_18rem]";

// A feed card's shape: author row, title, two lines of excerpt, topics, (cover,) action bar.
function PostCardSkeleton({ cover }) {
    return (
        <div className="rounded-xl border bg-card">
            <div className="flex items-center gap-3 px-4 pt-4">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                </div>
            </div>
            {/* Line boxes, not bar heights: a 20px title line is 28px tall, a 15px excerpt line 24px. */}
            <div className="flex flex-col gap-1.5 px-4 pt-3 pb-4">
                <Skeleton className="h-7 w-3/4" />
                <div className="space-y-2 py-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="flex gap-1.5 pt-1.5">
                    <Skeleton className="h-7 w-14" />
                    <Skeleton className="h-7 w-16" />
                </div>
            </div>
            {cover && <Skeleton className="aspect-[2/1] w-full rounded-none border-t" />}
            <div className="flex items-center justify-between border-t p-1.5">
                <div className="flex gap-1">
                    <Skeleton className="h-10 w-14" />
                    <Skeleton className="h-10 w-14" />
                </div>
                <Skeleton className="h-10 w-20" />
            </div>
        </div>
    );
}

/** The feed while it loads: the same frame, header, columns and card shape as `Blog`. */
export function BlogSkeleton() {
    const pills = ["w-20", "w-24", "w-16", "w-20"];
    return (
        <div className={FRAME} role="status" aria-busy="true" aria-label="Loading posts">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-28 sm:h-10" />
                <Skeleton className="my-0.5 h-4 w-80 max-w-full" />
            </div>
            <div className="-mt-2 flex gap-2 overflow-hidden @4xl:hidden">
                {pills.map((width, index) => <Skeleton key={index} className={`h-8 shrink-0 rounded-sm ${width}`} />)}
            </div>
            <div className={COLUMNS}>
                <div className="flex min-w-0 flex-col gap-4">
                    <PostCardSkeleton cover />
                    <PostCardSkeleton />
                    <PostCardSkeleton cover />
                </div>
                {/* The write card is for signed-in readers only, so the skeleton holds the Topics card alone. */}
                <div className="hidden @4xl:block">
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                        <Skeleton className="h-4 w-16" />
                        <div className="flex flex-wrap gap-2">
                            {pills.map((width, index) => <Skeleton key={index} className={`h-8 rounded-sm ${width}`} />)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Blog({ initial, tag, topics = [] }) {
    const items = initial?.items || [];
    // The server's most used topics ({ name, posts }); the shown posts' tags only when that list did not load.
    const tags = topics.length > 0
        ? [...topics]
        : [...new Set(items.flatMap((post) => post.tags || []))].map((name) => ({ name }));
    if (tag && !tags.some((topic) => topic.name === tag)) tags.unshift({ name: tag });
    const pageIds = items.map((post) => post.id);

    return (
        // The shell frame Course and Roadmap use. Two columns from a 56rem content width (a container
        // query, so the app sidebar is counted): the feed fills its column next to an 18rem sidebar.
        <div className={FRAME}>
            {/* Below lg the sidebar's actions move into the header (Write beside the title, My posts in the
                description), so only the topic row stands between the title and the first post. */}
            <header className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {tag ? `Posts about ${tag}` : "Blog"}
                    </h1>
                    <SignedIn>
                        <Button asChild size="sm" className="mt-1 shrink-0 @4xl:hidden">
                            <Link href="/blog/new">
                                <LuPenLine aria-hidden="true" />
                                Write
                            </Link>
                        </Button>
                    </SignedIn>
                </div>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Knowledge and learning experience shared by CodeDev learners.
                    <SignedIn>
                        <Link href="/blog/me" className="ml-1.5 font-medium whitespace-nowrap text-primary-ink underline-offset-4 hover:underline @4xl:hidden">
                            My posts
                        </Link>
                    </SignedIn>
                </p>
            </header>

            {tags.length > 0 && (
                // Pulled up 8px: the topic row belongs to the header above it.
                <div className="-mt-2 @4xl:hidden">
                    <TagNav tags={tags} tag={tag} scroll />
                </div>
            )}

            <div className={COLUMNS}>
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

                <aside className="hidden @4xl:block" aria-label="Write and browse topics">
                    <div className="sticky top-20 flex flex-col gap-4">
                        <SignedIn>
                            <WriteCard />
                        </SignedIn>
                        {tags.length > 0 && (
                            <section aria-labelledby="blog-topics-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                                <h2 id="blog-topics-heading" className="text-sm font-semibold text-foreground">Topics</h2>
                                <TagNav tags={tags} tag={tag} />
                            </section>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
