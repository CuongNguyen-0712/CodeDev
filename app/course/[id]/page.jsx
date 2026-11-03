import { notFound } from "next/navigation"

import PreviewPage from "@/components/course/params/previewPage"

import { courseQueries } from "@/queries/course.query"
import { courseExists, getPrerenderedCourseIds, getPublicCourse } from "@/lib/cachedData"
import { dehydrateCached } from "@/lib/hydrate"
import { cacheTags } from "@/lib/pageCache"

import DefaultLayout from "@/components/layouts/defaultLayout";

import { HydrationBoundary } from "@tanstack/react-query";

// ISR: the page holds only the public course (same for everyone, 'use cache' in lib/cachedData), so
// one copy serves every visitor. The viewer's enrolment, progress and ownership load in the browser
// (hooks/useCourseDetails). Writes mark it stale at once (lib/pageCache).

// The newest courses are built ahead; any other is generated on its first visit, then cached.
// `params` is awaited outside <Suspense>, so that first visit creates the URL's own ISR entry.
export async function generateStaticParams() {
    return (await getPrerenderedCourseIds()).map((id) => ({ id }));
}

const loadCourse = (id) => getPublicCourse(id);

export async function generateMetadata({ params }) {
    const { id } = await params;

    const course = await loadCourse(id).catch(() => null);

    if (!course) {
        return {
            title: "Course not found",
        };
    }

    return {
        title: `${course.title} | Course`,
        description: course.description,
    };
}

export default async function Page({ params }) {
    const { id } = await params

    // undefined = the lookup failed (the client shows Retry); null = not published.
    const data = await loadCourse(id).catch((error) => {
        console.error("Failed to prefetch course details:", error);
        return undefined;
    });

    // Unknown or deleted: a real 404. Unpublished: still open to the learners who own it, so the
    // browser asks again with their session (the API decides).
    if (data === null && !(await courseExists(id).catch(() => true))) notFound();

    const state = await dehydrateCached(
        data ? [{ queryKey: courseQueries.details(id).queryKey, data }] : [],
        { tags: [cacheTags.course(id)] }
    );

    return (
        <DefaultLayout>
            <HydrationBoundary state={state}>
                <PreviewPage
                    params={{ id }}
                />
            </HydrationBoundary>
        </DefaultLayout>
    )
}
