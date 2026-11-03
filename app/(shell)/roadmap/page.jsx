import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

import RoadmapPage from "@/components/roadmap/roadmapPage";
import { PageSkeleton } from "@/components/ui/loading";

import { roadmapService } from "@/services/roadmap.service";
import { roadmapQueries } from "@/queries/roadmap.query";

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

// The list is the same for everyone (cached in Redis) and is rendered into the HTML. The search and
// level filter live in the URL, so the list is rendered per request, filtered view included.
async function RoadmapList({ searchParams }) {
	await searchParams;

	const queryClient = new QueryClient();
	const roadmaps = await roadmapService.getList().catch((error) => {
		// The client fetches it again and shows Retry if that fails too.
		console.error("Failed to prefetch the roadmap list:", error);
		return null;
	});
	if (roadmaps) queryClient.setQueryData(roadmapQueries.list().queryKey, roadmaps);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<RoadmapPage />
		</HydrationBoundary>
	)
}

// Request-dependent (URL), so behind <Suspense>: with Cache Components the rest is the static shell.
export default function Page({ searchParams }) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<RoadmapList searchParams={searchParams} />
		</Suspense>
	)
}
