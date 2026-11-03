import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

import RoadmapPage from "@/components/roadmap/roadmapPage";

import { roadmapService } from "@/services/roadmap.service";
import { roadmapQueries } from "@/queries/roadmap.query";

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

// The list is the same for everyone (cached in Redis) and is rendered into the HTML. The page reads
// `searchParams` because the search and level filter live in the URL: rendered per request, the
// filtered view is in the HTML too, instead of a skeleton that the browser fills in.
export default async function Page({ searchParams }) {
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
