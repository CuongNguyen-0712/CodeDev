import { Suspense } from "react";
import { notFound } from "next/navigation";
import DefaultLayout from "@/components/layouts/defaultLayout";
import { PageSkeleton } from "@/components/ui/loading";
import RoadmapDetailsPage from "@/components/roadmap/[id]/roadmapDetailsPage";
import { roadmapService } from "@/services/roadmap.service";
import { getPublicRoadmap } from "@/lib/cachedData";

// ISR: the page renders the guest view (same for everyone, 'use cache' in lib/cachedData, 10
// minutes like the Redis copy); a signed-in learner's course progress loads in the browser
// (roadmapQueries.details(id, "viewer")).

// `params` stays outside <Suspense> (see app/course/[id]/page.jsx); `instant = false` only turns
// the instant-navigation check off.
export const instant = false;

// Every roadmap is built ahead (a short list); `params` is awaited outside <Suspense>, so a roadmap
// added later gets its own ISR entry on its first visit.
export async function generateStaticParams() {
    return (await roadmapService.getList()).map((roadmap) => ({ id: roadmap.id }));
}

const loadRoadmap = (id) => getPublicRoadmap(id);

export async function generateMetadata({ params }) {
    try {
        const { id } = await params;
        const data = await loadRoadmap(id);

        if (!data) {
            return {
                title: "Roadmap Not Found | CodeDev",
            };
        }

        return {
            title: `${data.title} | Roadmap | CodeDev`,
            description: data.description || "Step-by-step developer roadmap and learning milestones.",
        };
    } catch {
        return {
            title: "Roadmap | CodeDev",
            description: "Interactive visual developer learning roadmap.",
        };
    }
}

export default async function Page({ params }) {
    const { id } = await params;

    let roadmapData = null;
    let missing = false;
    try {
        roadmapData = await loadRoadmap(id);
    } catch (err) {
        // roadmapService throws ApiError 404 for unknown ids; other errors leave the client to retry.
        if (err?.status === 404) missing = true;
        else console.error("Failed to prefetch roadmap details:", err);
    }

    // Outside the try: notFound() works by throwing.
    if (missing) notFound();

    return (
        <DefaultLayout>
            {roadmapData ? (
                <RoadmapDetailsPage params={{ id }} initialData={roadmapData} />
            ) : (
                // No server copy (the lookup failed): the client fetches it, which reads React Query.
                <Suspense fallback={<PageSkeleton />}>
                    <RoadmapDetailsPage params={{ id }} initialData={null} />
                </Suspense>
            )}
        </DefaultLayout>
    );
}
