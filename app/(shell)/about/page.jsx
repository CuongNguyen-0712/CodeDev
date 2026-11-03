import AboutPage from "@/components/about/aboutPage";
import { getCatalogStats, getShelfCourses } from "@/lib/cachedData";

export async function generateMetadata() {
    return {
        title: "About | CodeDev",
        description: "How CodeDev teaches programming: short written lessons, coding challenges run against tests in a sandbox, hints, quizzes and roadmaps for developer roles.",
    };
}

export default async function Page() {
    // Live catalog figures and the course shelf, cached 10 minutes (lib/cachedData); without them
    // the copy still reads.
    const [stats, courses] = await Promise.all([
        getCatalogStats().catch(() => null),
        getShelfCourses().catch(() => []),
    ]);

    return (
        <AboutPage stats={stats} courses={courses} />
    );
}
