import Link from "next/link";

import BlogMarkdown from "@/components/blog/markdown";
import PostActions from "@/components/blog/postActions";
import PostCard, { AuthorAvatar, PostMeta } from "@/components/blog/postCard";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";

import { blogPostingJsonLd } from "@/lib/blog/jsonLd.mjs";
import { siteOrigin } from "@/lib/siteUrl";
import { mediaOrigins } from "@/lib/media/mediaOrigins.mjs";

import { LuArrowLeft } from "react-icons/lu";

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
        // Reading column 40rem (about 70 characters at 17px); the contents list sits beside it from xl.
        <div className="mx-auto grid w-full max-w-[42rem] gap-x-16 gap-y-8 px-4 pt-6 pb-16 lg:pt-8 xl:max-w-[60rem] xl:grid-cols-[minmax(0,40rem)_14rem]">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
            <Button asChild variant="ghost" size="sm" className="-ml-2.5 self-start justify-self-start text-muted-foreground xl:col-span-2">
                <Link href="/blog">
                    <LuArrowLeft />
                    Blog
                </Link>
            </Button>

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
                                    <Badge asChild variant="outline">
                                        <Link href={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </header>

                <BlogMarkdown body={post.body} origins={mediaOrigins()} className="text-[1.0625rem] leading-[1.75]" />

                <PostActions postId={post.id} likeCount={post.likeCount ?? 0} commentCount={post.commentCount ?? 0} />

                <footer className="flex items-center gap-4 border-t pt-8">
                    <AuthorAvatar author={post.author} size="lg" />
                    <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Written by</span>
                        <Link href={`/profile/${post.author.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                            {post.author.username}
                        </Link>
                    </div>
                </footer>
            </article>

            {showToc && (
                <aside className="hidden xl:block">
                    <TableOfContents headings={headings} />
                </aside>
            )}

            {related.length > 0 && (
                <section aria-labelledby="related-heading" className="flex min-w-0 flex-col gap-2 border-t pt-8 xl:col-start-1">
                    <h2 id="related-heading" className="text-lg font-semibold tracking-tight text-foreground">
                        {topic ? `More about ${topic}` : "More posts"}
                    </h2>
                    <div className="flex flex-col gap-4 pt-2">
                        {related.map((item) => <PostCard key={item.id} post={item} />)}
                    </div>
                </section>
            )}
        </div>
    );
}
