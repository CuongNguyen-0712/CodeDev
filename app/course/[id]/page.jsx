import { cache } from "react"
import { notFound } from "next/navigation"

import PreviewPage from "@/components/course/params/previewPage"

import { courseService } from "@/services/course.service"
import { courseQueries } from "@/queries/course.query"

import DefaultLayout from "@/components/layouts/defaultLayout";

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

// ISR: the page holds only the public course (same for everyone), so one copy serves every visitor.
// The viewer's enrolment, progress and ownership load in the browser (hooks/useCourseDetails).
// Regenerated after TTL.COURSE_DETAILS_PUBLIC at the latest; writes drop it at once (lib/pageCache).
export const revalidate = 300;

// No course is built ahead: each page is generated on its first visit, then served from the cache.
export async function generateStaticParams() {
    return [];
}

// One lookup per render, shared by generateMetadata and the page (Redis-cached in the service).
const loadCourse = cache((id) => courseService.getDetails({ courseId: id }));

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
    if (data === null && !(await courseService.exists(id).catch(() => true))) notFound();

    const queryClient = new QueryClient();
    if (data) {
        queryClient.setQueryData(courseQueries.details(id).queryKey, data);
    }

    return (
        <DefaultLayout>
            <HydrationBoundary state={dehydrate(queryClient)}>
                <PreviewPage
                    params={{ id }}
                />
            </HydrationBoundary>
        </DefaultLayout>
    )
}
