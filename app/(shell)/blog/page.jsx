import { Suspense } from "react"

import Blog, { BlogSkeleton } from "@/components/blog/blog"

import { TAG_PATTERN } from "@/lib/blog/tags.mjs";
import { getBlogPage, getBlogTopics } from "@/lib/cachedData";

export const metadata = {
    title: "Blog | CodeDev",
    description: "Articles about programming, learning to code and updates to CodeDev.",
};

// `searchParams` is runtime data: reading it inside <Suspense> keeps the shell prerendered; the
// list itself comes from the cached getter.
async function BlogList({ searchParams }) {
    const { tag } = await searchParams;
    // Only a well-formed tag reaches the cached getter, so arbitrary strings cannot fill the cache.
    const tagValue = typeof tag === "string" && TAG_PATTERN.test(tag) ? tag : null;

    // Errors are never cached: an outage shows the empty state instead of a 500.
    const [initial, topics] = await Promise.all([
        getBlogPage(tagValue).catch((error) => {
            console.error("Failed to load blog posts:", error);
            return { items: [], nextCursor: null };
        }),
        // Without topics the feed falls back to the tags of the posts it shows.
        getBlogTopics().catch((error) => {
            console.error("Failed to load blog topics:", error);
            return [];
        }),
    ]);

    return <Blog initial={initial} tag={tagValue} topics={topics} />;
}

export default function Page({ searchParams }) {
    return (
        <Suspense fallback={<BlogSkeleton />}>
            <BlogList searchParams={searchParams} />
        </Suspense>
    );
}
