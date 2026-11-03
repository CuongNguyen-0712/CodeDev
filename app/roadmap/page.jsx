import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui/loading";

import RoadmapPage from "@/components/roadmap/roadmapPage";
import HomeLayout from '@/components/layouts/homeLayout';

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

export default function Page() {
	return (
		<HomeLayout>
			<Suspense fallback={<PageSkeleton />}>
				<RoadmapPage />
			</Suspense>
		</HomeLayout>
	)
}
