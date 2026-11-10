import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";
import { CommentButton, LikeButton } from "@/components/blog/postActions";
import SharePostButton from "@/components/blog/sharePostButton";
import { BAR_BUTTON, BAR_COUNT_BUTTON, TAG_BADGE, formatPostDate } from "@/components/blog/shared";

export { formatPostDate };

// A card shows at most this many topic badges; the post page shows them all.
const CARD_TAGS = 3;

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
 * A feed post, like a social timeline: who and when on top, then the title, the start of the text
 * and its topics, the post's first image full width, and an action bar with live counts. The title's
 * link stretches over the card; the author link, the topics and the action buttons sit above it.
 * `compact` (related posts) drops the image and the action bar.
 */
export default function PostCard({ post, pageIds, compact = false }) {
    const ids = pageIds ?? [post.id];
    const tags = (post.tags || []).slice(0, CARD_TAGS);
    // Related posts sit under an h2 ("More about …"), so their titles are one level down.
    const Title = compact ? "h3" : "h2";
    return (
        // No overflow-hidden: it would clip the focus rings of the bar buttons at the corners.
        <article className="relative rounded-xl border bg-card transition-colors hover:border-primary-border has-[[data-card-link]:focus-visible]:ring-[3px] has-[[data-card-link]:focus-visible]:ring-ring/50">
            <header className="flex items-center gap-3 px-4 pt-4">
                <AuthorAvatar author={post.author} size="lg" />
                <div className="flex min-w-0 flex-col">
                    <Link
                        href={`/profile/${post.author.id}`}
                        className="relative z-10 truncate text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                        {post.author.username}
                    </Link>
                    <p className="flex gap-x-1.5 text-xs text-muted-foreground">
                        <time className="whitespace-nowrap" dateTime={new Date(post.publishedAt).toISOString()}>{formatPostDate(post.publishedAt)}</time>
                        <span aria-hidden="true">·</span>
                        <span className="whitespace-nowrap">{post.readingMinutes} min read</span>
                    </p>
                </div>
            </header>

            <div className="flex flex-col gap-1.5 px-4 pt-3 pb-4">
                <Title className={cn("line-clamp-3 leading-snug font-semibold tracking-tight text-balance text-foreground", compact ? "text-[1.0625rem]" : "text-xl")}>
                    <Link href={`/blog/${post.slug}`} data-card-link="" className="underline-offset-4 outline-none after:absolute after:inset-0 hover:underline">
                        {post.title}
                    </Link>
                </Title>
                {post.excerpt && (
                    <p className={cn("text-[0.9375rem] leading-relaxed text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>{post.excerpt}</p>
                )}
                {tags.length > 0 && (
                    <ul className="relative z-10 flex list-none flex-wrap gap-1.5 self-start p-0 pt-1.5">
                        {tags.map((tag) => (
                            <li key={tag}>
                                <Badge asChild variant="outline" className={TAG_BADGE}>
                                    <Link href={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {!compact && post.cover && (
                // A fixed 16:9 box, so the feed does not jump when a lazy image arrives.
                <div className="aspect-video border-t bg-muted">
                    <img src={post.cover} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                </div>
            )}

            {!compact && (
                // Full-bleed bar: it also draws the line under the cover, so the card never shows two rules.
                <div className="relative z-10 flex items-center justify-between gap-1 border-t p-1.5">
                    <div className="flex items-center gap-1">
                        <LikeButton
                            postId={post.id}
                            pageIds={ids}
                            likeCount={post.likeCount ?? 0}
                            authorId={post.author.id}
                            className={BAR_COUNT_BUTTON}
                        />
                        <CommentButton postId={post.id} pageIds={ids} slug={post.slug} commentCount={post.commentCount ?? 0} className={BAR_COUNT_BUTTON} />
                    </div>
                    <SharePostButton slug={post.slug} title={post.title} className={BAR_BUTTON} />
                </div>
            )}
        </article>
    );
}
