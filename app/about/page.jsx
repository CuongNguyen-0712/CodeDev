import { Suspense } from "react";
import HomeLayout from "@/components/layouts/homeLayout";
import { LoadingRedirect } from "@/components/ui/loading";
import AboutPage from "@/components/about/aboutPage";
import { courseService } from "@/services/course.service";

export async function generateMetadata() {
    return {
        title: "About | CodeDev",
        description: "How CodeDev teaches programming: short written lessons, coding challenges run against tests in a sandbox, hints, quizzes and roadmaps for developer roles.",
    };
}

// Live catalog figures (cached 10 minutes); the page is rebuilt as often.
export const revalidate = 600;

export default async function Page() {
    const stats = await courseService.getCatalogStats().catch(() => null);

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <AboutPage stats={stats} />
            </HomeLayout>
        </Suspense>
    );
}
