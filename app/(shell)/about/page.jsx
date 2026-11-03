import AboutPage from "@/components/about/aboutPage";
import { getCatalogStats } from "@/lib/cachedData";

export async function generateMetadata() {
    return {
        title: "About | CodeDev",
        description: "How CodeDev teaches programming: short written lessons, coding challenges run against tests in a sandbox, hints, quizzes and roadmaps for developer roles.",
    };
}

export default async function Page() {
    // Live catalog figures, cached 10 minutes (lib/cachedData); without them the copy still reads.
    const stats = await getCatalogStats().catch(() => null);

    return (
        <AboutPage stats={stats} />
    );
}
