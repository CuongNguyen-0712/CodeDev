import { Suspense } from "react";
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

    let roadmapData = null;
    try {
        roadmapData = await roadmapService.getDetails({ publicId: id });
        if (roadmapData) {
            queryClient.setQueryData(roadmapQueries.details(id).queryKey, {
                success: true,
                data: roadmapData,
            });
        }
    } catch (err) {
        console.error("Failed to prefetch roadmap details:", err);
    }

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
