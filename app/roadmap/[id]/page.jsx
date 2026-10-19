import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/session";
import { LoadingRedirect } from "@/components/ui/loading";
import DefaultLayout from "@/components/layouts/defaultLayout";
import RoadmapDetailsPage from "@/components/roadmap/[id]/roadmapDetailsPage";
import { roadmapService } from "@/services/roadmap.service";
import { roadmapQueries } from "@/queries/roadmap.query";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

export async function generateMetadata({ params }) {
    try {
        const { id } = await params;
        const data = await roadmapService.getDetails({ publicId: id });

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
    const queryClient = new QueryClient();

    // Include the signed-in user so the prefetched data carries their progress
    let userId = null;
    try {
        const session = await getAuthSession({ soft: true });
        userId = session?.user?.id ?? null;
    } catch {
        userId = null;
    }

    let roadmapData = null;
    let missing = false;
    try {
        roadmapData = await roadmapService.getDetails({ publicId: id, userId });
        if (roadmapData) {
            queryClient.setQueryData(roadmapQueries.details(id).queryKey, {
                success: true,
                data: roadmapData,
            });
        }
    } catch (err) {
        // roadmapService throws ApiError 404 for unknown ids; other errors leave the client to retry.
        if (err?.status === 404) missing = true;
        else console.error("Failed to prefetch roadmap details:", err);
    }

    // Outside the try: notFound() works by throwing.
    if (missing) notFound();

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <HydrationBoundary state={dehydrate(queryClient)}>
                    <RoadmapDetailsPage params={{ id }} initialData={roadmapData} />
                </HydrationBoundary>
            </DefaultLayout>
        </Suspense>
    );
}
