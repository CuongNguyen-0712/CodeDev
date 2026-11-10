import Link from "next/link";

import BlogMarkdown from "@/components/blog/markdown";
import PostActions from "@/components/blog/postActions";
import PostComments from "@/components/blog/postComments";
import PostCard, { PostMeta } from "@/components/blog/postCard";
import { READING_PROSE, TAG_BADGE } from "@/components/blog/shared";
import { Badge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";

import { blogPostingJsonLd } from "@/lib/blog/jsonLd.mjs";
import { siteOrigin } from "@/lib/siteUrl";
import { mediaOrigins } from "@/lib/media/mediaOrigins.mjs";


function TableOfContents({ headings }) {
    return (
        <nav aria-labelledby="toc-heading" className="sticky top-20 flex flex-col gap-3 border-l pl-4">
            <h2 id="toc-heading" className="text-sm font-semibold text-foreground">On this page</h2>
            <ol className="flex list-none flex-col gap-2 p-0 text-sm">
                {headings.map((heading) => (
                    <li key={heading.id} className={heading.depth === 3 ? "pl-3" : undefined}>
                        <a href={`#${heading.id}`} className="block text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
                            {heading.text}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/** `headings` (h2/h3 with ids) and `related` (other published posts) come from the page. */
export default function PostPage({ post, headings = [], related = [] }) {
    const jsonLd = blogPostingJsonLd(post, siteOrigin());
    // A contents list for one heading is noise.
    const showToc = headings.length >= 2;
    const topic = post.tags?.[0];

    return (
        // The shell frame, with the 40rem reading column (about 70 characters at 17px) centred in it, or
        // the column and its contents list centred together from xl: a left-aligned column left a wide
        // empty band on the right of every post without a contents list.
        // The second track exists only with a contents list, or an empty 14rem column pulls the page left.
        <div className={cn("mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,40rem)] justify-center gap-x-16 gap-y-8 px-4 pt-6 pb-16 sm:px-6 lg:pt-10", showToc && "xl:grid-cols-[minmax(0,40rem)_14rem]")}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
            <article className="flex min-w-0 flex-col gap-10">
                <header className="flex flex-col gap-4">
                    <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                        {post.title}
                    </h1>
                    <PostMeta post={post} linkAuthor />
                    {post.tags?.length > 0 && (
                        <ul className="flex list-none flex-wrap gap-1.5 p-0">
                            {post.tags.map((tag) => (
                                <li key={tag}>
                                    <Badge asChild variant="outline" className={TAG_BADGE}>
                                        <Link href={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </header>

                <BlogMarkdown body={post.body} origins={mediaOrigins()} className={READING_PROSE} />

                <PostActions postId={post.id} slug={post.slug} title={post.title} likeCount={post.likeCount ?? 0} commentCount={post.commentCount ?? 0} />
            </article>

            {showToc && (
                <aside className="hidden xl:block">
                    <TableOfContents headings={headings} />
                </aside>
            )}

            <PostComments postId={post.id} slug={post.slug} initialCount={post.commentCount ?? 0} />

            {related.length > 0 && (
                <section aria-labelledby="related-heading" className="flex min-w-0 flex-col gap-2 pt-4 xl:col-start-1">
                    <h2 id="related-heading" className="text-xl font-semibold tracking-tight text-foreground">
                        {topic ? `More about ${topic}` : "More posts"}
                    </h2>
                    <div className="flex flex-col gap-4 pt-2">
                        {related.map((item) => <PostCard key={item.id} post={item} compact />)}
                    </div>
                </section>
            )}
        </div>
    );
}
