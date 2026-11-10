import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { cn } from "@/lib/utils";
import { CommentButton, LikeButton } from "@/components/blog/postActions";
import SharePostButton from "@/components/blog/sharePostButton";

// Feed action buttons, quiet like the course comment votes (commentItem.jsx voteButton).
const BAR_BUTTON = "text-muted-foreground hover:bg-muted hover:text-foreground";

// UTC so the server and the browser print the same day.
export const formatPostDate = (value) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));

export function AuthorAvatar({ author, size = "sm" }) {
    return (
        <Avatar size={size}>
            <AvatarImage src={author.image || undefined} alt="" />
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                {author.username.slice(0, 1).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}

/** Author, date and reading time on one line; each part keeps its words together when the line wraps. */
export function PostMeta({ post, linkAuthor = false, className }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
            <AuthorAvatar author={post.author} />
            {linkAuthor ? (
                <Link href={`/profile/${post.author.id}`} className="relative z-10 font-medium text-foreground underline-offset-4 hover:underline">
                    {post.author.username}
                </Link>
            ) : (
                <span className="font-medium text-foreground">{post.author.username}</span>
            )}
            <span aria-hidden="true">·</span>
            <time className="whitespace-nowrap" dateTime={new Date(post.publishedAt).toISOString()}>{formatPostDate(post.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{post.readingMinutes} min read</span>
        </div>
    );
}

/**
 * A feed post, like a social timeline: who and when on top, then the title and the start of the
 * text, the post's first image full width, and an action bar with live counts. The title's
 * link stretches over the card; the author link and the action buttons sit above it.
 */
export default function PostCard({ post, pageIds }) {
    const ids = pageIds ?? [post.id];
    return (
        <article className="group relative overflow-hidden rounded-xl border bg-card">
            <header className="flex items-center gap-3 px-4 pt-4">
                <AuthorAvatar author={post.author} size="lg" />
                <div className="flex min-w-0 flex-col">
                    <Link
                        href={`/profile/${post.author.id}`}
                        className="relative z-10 truncate text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                        {post.author.username}
                    </Link>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                        <time className="whitespace-nowrap" dateTime={new Date(post.publishedAt).toISOString()}>{formatPostDate(post.publishedAt)}</time>
                        <span aria-hidden="true">·</span>
                        <span className="whitespace-nowrap">{post.readingMinutes} min read</span>
                        {post.tags?.length > 0 && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>{post.tags.join(", ")}</span>
                            </>
                        )}
                    </p>
                </div>
            </header>

            <div className="flex flex-col gap-1.5 px-4 pt-3 pb-4">
                <h2 className="text-lg font-semibold tracking-tight text-balance text-foreground">
                    <Link href={`/blog/${post.slug}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline">
                        {post.title}
                    </Link>
                </h2>
                {post.excerpt && (
                    <p className="line-clamp-3 text-[0.9375rem] leading-relaxed text-foreground/85">{post.excerpt}</p>
                )}
            </div>

            {post.cover && (
                <div className="border-t bg-muted">
                    <img src={post.cover} alt="" loading="lazy" decoding="async" className="mx-auto max-h-[28rem] w-full object-cover" />
                </div>
            )}

            {/* Full-bleed bar: it also draws the line under the cover, so the card never shows two rules. */}
            <div className="relative z-10 flex items-center justify-between gap-1 border-t p-1">
                <div className="flex items-center gap-1">
                    <LikeButton
                        postId={post.id}
                        pageIds={ids}
                        likeCount={post.likeCount ?? 0}
                        authorId={post.author.id}
                        variant="ghost"
                        className={BAR_BUTTON}
                    />
                    <CommentButton postId={post.id} pageIds={ids} slug={post.slug} commentCount={post.commentCount ?? 0} className={BAR_BUTTON} />
                </div>
                <SharePostButton slug={post.slug} className={BAR_BUTTON} />
            </div>
        </article>
    );
}
