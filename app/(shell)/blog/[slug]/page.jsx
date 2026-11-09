import { notFound } from "next/navigation";

import PostPage from "@/components/blog/postPage";

import { getPrerenderedPostSlugs, getPublicPost } from "@/lib/cachedData";

// `params` stays outside <Suspense>, as on app/course/[id]; `instant = false` only turns that check off.
export const instant = false;

// The newest posts are built ahead; any other slug is generated on first visit. A declared list is
// what makes an unknown slug answer a real 404, and Cache Components rejects an empty one, so
// "__none__" stands in (it resolves to notFound()).
export async function generateStaticParams() {
    const slugs = await getPrerenderedPostSlugs().catch(() => []);
    return (slugs.length ? slugs : ["__none__"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const post = await getPublicPost(slug).catch(() => null);

    if (!post) return { title: "Post not found | CodeDev" };

    return {
        title: `${post.title} | CodeDev Blog`,
        description: post.excerpt,
        alternates: { canonical: `/blog/${post.slug}` },
        openGraph: {
            type: "article",
            publishedTime: new Date(post.publishedAt).toISOString(),
            modifiedTime: new Date(post.updatedAt || post.publishedAt).toISOString(),
            authors: [post.author.username],
        },
        twitter: { card: "summary" },
    };
}

export default async function Page({ params }) {
    const { slug } = await params;

    // A failed read throws to the error boundary rather than caching a 404.
    const post = await getPublicPost(slug);
    if (!post) notFound();

    return <PostPage post={post} />;
}
