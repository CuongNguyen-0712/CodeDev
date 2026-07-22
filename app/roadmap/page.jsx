import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import RoadmapPage from "../component/roadmap/roadmapPage";
import HomeLayout from "../layout/homeLayout";

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

export default function Page() {
	return (
		<HomeLayout>
			<Suspense fallback={<LoadingRedirect />}>
				<RoadmapPage />
			</Suspense>
		</HomeLayout>
	)
}
