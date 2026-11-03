import { cache } from "react";
import { notFound } from "next/navigation";
import DefaultLayout from "@/components/layouts/defaultLayout";
import RoadmapDetailsPage from "@/components/roadmap/[id]/roadmapDetailsPage";
import { roadmapService } from "@/services/roadmap.service";

// ISR: the page renders the guest view (same for everyone); a signed-in learner's course progress
// loads in the browser (roadmapQueries.details(id, "viewer")). Regenerated after
// TTL.ROADMAP_DETAILS_PUBLIC, like the Redis copy it is built from.
export const revalidate = 600;

// No roadmap is built ahead: each page is generated on its first visit, then served from the cache.
export async function generateStaticParams() {
    return [];
}

// One lookup per render, shared by generateMetadata and the page.
const loadRoadmap = cache((id) => roadmapService.getDetails({ publicId: id }));

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
            <RoadmapDetailsPage params={{ id }} initialData={roadmapData} />
        </DefaultLayout>
    );
}
