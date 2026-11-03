import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

import CoursePage from "@/components/course/coursePage";
import { PageSkeleton } from "@/components/ui/loading";

import { courseService } from "@/services/course.service";
import { courseQueries } from "@/queries/course.query";
import { getAuthSession } from "@/lib/session";
import { parseListQuery, toQueryParams } from "@/lib/listFilters";

export async function generateMetadata() {
    return {
        title: "Course | CodeDev",
        description: "Discover courses to enhance your skills",
    }
}

// The first page of the list the URL asks for is rendered on the server, so it is in the HTML;
// React Query then takes over (filters, sort, infinite scroll) under the same cache key.
async function CourseList({ searchParams }) {
    const state = parseListQuery("course", await searchParams);

    // Signed-in learners do not see the courses they are enrolled in (as the API does).
    const session = await getAuthSession({ soft: true });
    const firstPage = await courseService
        .getList({ userId: session?.user?.id ?? null, ...state, limit: 20 })
        .catch((error) => {
            // The client fetches it again and shows Retry if that fails too.
            console.error("Failed to prefetch the course list:", error);
            return null;
        });

    const queryClient = new QueryClient();
    if (firstPage) {
        queryClient.setQueryData(courseQueries.list(toQueryParams("course", state)).queryKey, { pages: [firstPage], pageParams: [null] });
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CoursePage />
        </HydrationBoundary>
    )
}

// The list depends on the request (URL and viewer), so it sits behind <Suspense>: with Cache
// Components the rest of the route is the prerendered shell.
export default function Page({ searchParams }) {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <CourseList searchParams={searchParams} />
        </Suspense>
    )
}
