import IndexPage from "@/components/index"

import { getCatalogStats, getShelfCourses } from "@/lib/cachedData"

export const metadata = {
    title: "CodeDev | Learn to code by writing code",
    description: "Short written lessons, each ending in a coding challenge you run against tests, with roadmaps for frontend, backend, DevOps and data roles.",
};

export default async function Page() {
    // Catalog figures and the course shelf, cached 10 minutes (lib/cachedData), so the page is part
    // of the static shell. Without the database (a build machine, an outage) the copy still reads.
    const [stats, courses] = await Promise.all([
        getCatalogStats().catch(() => null),
        getShelfCourses().catch(() => []),
    ]);

    return (
        <IndexPage stats={stats} courses={courses} />
    )
}
