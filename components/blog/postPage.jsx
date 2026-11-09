import Link from "next/link";

import BlogMarkdown from "@/components/blog/markdown";
import { formatPostDate } from "@/components/blog/postCard";
import { Badge } from "@/components/shadcn/badge";

import { blogPostingJsonLd } from "@/lib/blog/jsonLd.mjs";
import { siteOrigin } from "@/lib/siteUrl";
import { mediaOrigins } from "@/lib/media/mediaOrigins.mjs";

export default function PostPage({ post }) {
    const jsonLd = blogPostingJsonLd(post, siteOrigin());

    return (
        <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
            <header className="flex flex-col gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {post.title}
                </h1>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <Link href={`/profile/${post.author.id}`} className="font-medium text-foreground hover:underline">
                        {post.author.username}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <time dateTime={new Date(post.publishedAt).toISOString()}>{formatPostDate(post.publishedAt)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{post.readingMinutes} min read</span>
                </p>
                {post.tags?.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                        {post.tags.map((tag) => (
                            <li key={tag}>
                                <Badge asChild variant="outline">
                                    <Link href={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </header>
            <BlogMarkdown body={post.body} origins={mediaOrigins()} />
        </article>
    );
}
