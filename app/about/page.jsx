import { Suspense } from "react";
import HomeLayout from "@/components/layouts/homeLayout";
import { LoadingRedirect } from "@/components/ui/loading";
import AboutPage from "@/components/about/aboutPage";

export async function generateMetadata() {
    return {
        title: "About Us | CodeDev - Empowering Developers Worldwide",
        description: "Discover CodeDev's mission, values, and vision. We provide hands-on interactive coding courses, career roadmaps, and a thriving developer ecosystem.",
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <AboutPage />
            </HomeLayout>
        </Suspense>
    );
}