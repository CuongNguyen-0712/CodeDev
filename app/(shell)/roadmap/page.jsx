import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

import RoadmapPage from "@/components/roadmap/roadmapPage";

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

// The list is the main content and follows the URL; as on /course, a <Suspense> around it would
// show it late, so the route renders per request.
export const instant = false;

export default function Page({ searchParams }) {
	return <RoadmapList searchParams={searchParams} />
}
