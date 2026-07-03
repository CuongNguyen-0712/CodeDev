import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import Roadmap from "../component/roadmap/roadmap";
import HomeLayout from "../layout/homeLayout";

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

export default function Page() {
	return (
		<Suspense fallback={<LoadingRedirect />}>
			<HomeLayout>
				<Roadmap />
			</HomeLayout>
		</Suspense>
	)
}
