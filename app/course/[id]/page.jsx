import { Suspense } from "react"
import { notFound } from "next/navigation"

import PreviewPage from "@/components/course/params/previewPage"
import { CourseContent, CourseMobileBar, CoursePageFrame } from "@/components/course/params/courseContent"
import { PageSkeleton } from "@/components/ui/loading"

import { courseQueries } from "@/queries/course.query"
import { courseExists, getPrerenderedCourseIds, getPublicCourse } from "@/lib/cachedData"
import { dehydrateCached } from "@/lib/hydrate"
import { cacheTags } from "@/lib/pageCache"

import DefaultLayout from "@/components/layouts/defaultLayout";

import { HydrationBoundary } from "@tanstack/react-query";

// ISR: the page holds only the public course (same for everyone, 'use cache' in lib/cachedData), so
// one copy serves every visitor. The viewer's enrolment, progress and ownership load in the browser
// (hooks/useCourseDetails). Writes mark it stale at once (lib/pageCache).

// `params` stays outside <Suspense>: the docs suggest awaiting it inside one for an instant first
// visit to an unlisted id, but a <Suspense> around the main content shows it late (measured on
// /course, docs/rendering-strategy-plan.md). `instant = false` only turns that check off.
export const instant = false;

// The newest courses are built ahead; any other is generated on its first visit, then cached (its
// own ISR entry, because `params` is awaited outside <Suspense>). Course cards prefetch them.
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

    // TanStack's dehydrate() reads the clock, which a prerender rejects (lib/hydrate).
    const state = await dehydrateCached(
        data ? [{ queryKey: courseQueries.details(id).queryKey, data }] : [],
        { tags: [cacheTags.course(id)] }
    );

    // Published: the page is rendered here, on the server; only the islands are client code.
    // Otherwise the client fallback fetches it with the viewer's session.
    return (
        <DefaultLayout>
            <HydrationBoundary state={state}>
                {data ? (
                    <CoursePageFrame title={data.title} mobileBar={<CourseMobileBar course={data} courseId={id} />}>
                        <CourseContent course={data} courseId={id} />
                    </CoursePageFrame>
                ) : (
                    <Suspense fallback={<PageSkeleton />}>
                        <PreviewPage params={{ id }} />
                    </Suspense>
                )}
            </HydrationBoundary>
        </DefaultLayout>
    )
}
