import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

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

function PostTags({ tags }) {
    if (!tags?.length) return null;
    return (
        <ul className="flex list-none flex-wrap gap-1.5 p-0">
            {tags.map((tag) => (
                <li key={tag}><Badge variant="muted">{tag}</Badge></li>
            ))}
        </ul>
    );
}

/** `featured`: the lead story at the top of the list; default: a row in the list (the whole row is the link). */
export default function PostCard({ post, featured = false }) {
    return (
        <article
            className={cn(
                "group relative flex flex-col",
                featured ? "gap-4 rounded-xl border bg-card p-6 sm:p-8" : "gap-2 py-6",
            )}
        >
            <h2
                className={cn(
                    "font-semibold tracking-tight text-balance text-foreground",
                    featured ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
                )}
            >
                <Link href={`/blog/${post.slug}`} className="underline-offset-4 after:absolute after:inset-0 group-hover:underline">
                    {post.title}
                </Link>
            </h2>
            {post.excerpt && (
                <p className={cn("max-w-[68ch] text-muted-foreground", featured ? "line-clamp-3 text-base" : "line-clamp-2 text-sm")}>
                    {post.excerpt}
                </p>
            )}
            <PostTags tags={post.tags} />
            <PostMeta post={post} className={featured ? "mt-2" : undefined} />
        </article>
    );
}
