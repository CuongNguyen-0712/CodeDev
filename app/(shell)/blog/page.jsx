import { Suspense } from "react"

import Blog from "@/components/blog/blog"
import { PageSkeleton } from "@/components/ui/loading"

import { getBlogPage } from "@/lib/cachedData";

export const metadata = {
    title: "Blog | CodeDev",
    description: "Articles about programming, learning to code and updates to CodeDev.",
};

// `searchParams` is runtime data: reading it inside <Suspense> keeps the shell prerendered; the
// list itself comes from the cached getter.
async function BlogList({ searchParams }) {
    const { tag } = await searchParams;
    const tagValue = typeof tag === "string" && tag ? tag : null;

    // Errors are never cached: an outage shows the empty state instead of a 500.
    const initial = await getBlogPage(tagValue).catch((error) => {
        console.error("Failed to load blog posts:", error);
        return { items: [], nextCursor: null };
    });

    return <Blog initial={initial} tag={tagValue} />;
}

export default function Page({ searchParams }) {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <BlogList searchParams={searchParams} />
        </Suspense>
    );
}
