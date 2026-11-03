import IndexPage from "@/components/index"

import { courseService } from "@/services/course.service"

export const metadata = {
    title: "CodeDev | Learn to code by writing code",
    description: "Short written lessons, each ending in a coding challenge you run against tests, with roadmaps for frontend, backend, DevOps and data roles.",
};

// The catalog figures on the page are live (cached 10 minutes); the page is rebuilt as often.
export const revalidate = 600;

export default async function Page() {
    // Without the database (a build machine, an outage) the copy still reads, just without figures.
    const [stats, shelf] = await Promise.all([
        courseService.getCatalogStats().catch(() => null),
        // The course shelf is rendered here too, so the page carries it in its HTML.
        courseService.getList({ limit: 4 }).catch(() => null),
    ]);

    return (
        <IndexPage stats={stats} courses={shelf?.data ?? []} />
    )
}
