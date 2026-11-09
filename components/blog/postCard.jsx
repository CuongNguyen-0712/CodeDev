import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";

// UTC so the server and the browser print the same day.
export const formatPostDate = (value) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));

export default function PostCard({ post }) {
    return (
        <article className="relative flex flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:bg-accent">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
                <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
                    {post.title}
                </Link>
            </h2>
            {post.excerpt && (
                <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
            )}
            {post.tags?.length > 0 && (
                <ul className="flex list-none flex-wrap gap-1.5 p-0">
                    {post.tags.map((tag) => (
                        <li key={tag}><Badge variant="muted">{tag}</Badge></li>
                    ))}
                </ul>
            )}
            <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar size="sm">
                    <AvatarImage src={post.author.image || undefined} alt="" />
                    <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                        {post.author.username.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <span>{post.author.username}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={new Date(post.publishedAt).toISOString()}>{formatPostDate(post.publishedAt)}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingMinutes} min read</span>
            </div>
        </article>
    );
}
