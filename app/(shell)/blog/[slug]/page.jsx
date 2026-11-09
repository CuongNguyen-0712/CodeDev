import { notFound } from "next/navigation";

import PostPage from "@/components/blog/postPage";

import { getPublicPost } from "@/lib/cachedData";

// ISR per slug on first visit (user content, so no generateStaticParams). `params` stays outside
// <Suspense>, as on app/course/[id]; `instant = false` only turns that check off.
export const instant = false;

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
