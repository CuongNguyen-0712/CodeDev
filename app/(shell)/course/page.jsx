import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

import CoursePage from "@/components/course/coursePage";

import { courseService } from "@/services/course.service";
import { courseQueries } from "@/queries/course.query";
import { getAuthSession } from "@/lib/session";
import { getCatalogStats } from "@/lib/cachedData";
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
    const [firstPage, stats] = await Promise.all([
        courseService
            .getList({ userId: session?.user?.id ?? null, ...state, limit: 20 })
            .catch((error) => {
                // The client fetches it again and shows Retry if that fails too.
                console.error("Failed to prefetch the course list:", error);
                return null;
            }),
        // The line under the title; without it the page shows its plain description.
        getCatalogStats().catch(() => null),
    ]);

    const queryClient = new QueryClient();
    if (firstPage) {
        queryClient.setQueryData(courseQueries.list(toQueryParams("course", state)).queryKey, { pages: [firstPage], pageParams: [null] });
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CoursePage stats={stats} />
        </HydrationBoundary>
    )
}

// The list is the page's main content and depends on the request (URL and viewer). Behind <Suspense>
// it would stream into a hidden segment that shows only when React reveals it, seconds later on a
// slow phone (measured: LCP 1.6 s -> 5.7 s), so the route renders per request instead of keeping a
// prerendered shell around a skeleton.
export const instant = false;

export default function Page({ searchParams }) {
    return <CourseList searchParams={searchParams} />
}
