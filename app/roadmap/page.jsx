import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import RoadmapPage from "@/components/roadmap/roadmapPage";
import HomeLayout from '@/components/layouts/homeLayout';

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

export default function Page() {
	return (
		<Suspense fallback={<LoadingRedirect />}>
			<HomeLayout>
				<RoadmapPage />
			</HomeLayout>
		</Suspense>
	)
}
