
import Roadmap from "../component/roadmap/roadmap";
import HomeLayout from "../layout/homeLayout";

export const metadata = {
	title: "Roadmap | CodeDev",
	description: "A public roadmap for the learning journey.",
};

export default function Page() {
	return (
		<HomeLayout>
			<Roadmap />
		</HomeLayout>
	)
}
