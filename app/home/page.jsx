import { Suspense } from "react";

import { LoadingRedirect } from "../component/ui/loading";

import Content from "../component/home/content";

import HomeLayout from "../layout/homeLayout";

const pageTitles = {
    overview: {
        title: "Overview",
        description: "Welcome to CodeDev, your gateway to mastering coding skills...",
    },
    learning: {
        title: "Learning",
        description: "Discover courses to enhance your skills",
    },
    connection: {
        title: "Connection",
        description: "Keep your social circle active and grow your network.",
    }
};

export async function generateMetadata(context) {
    let { searchParams: rawSearchParams } = context ?? {};
    let searchParams = rawSearchParams ?? {};

    if (rawSearchParams && typeof rawSearchParams.then === "function") {
        searchParams = await rawSearchParams;
    }

    if (searchParams?.search) {
        return {
            title: "Search | CodeDev",
            description: "Search for courses, projects, and more",
        };
    }

    if (searchParams?.feedback) {
        return {
            title: "Feedback | CodeDev",
            description: "Share your feedback with us",
        };
    }

    const tab = searchParams?.tab || 'overview';
    const page = pageTitles[tab] || pageTitles.overview;

    return {
        title: `${page.title} | CodeDev`,
        description: page.description,
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <Content />
            </HomeLayout>
        </Suspense>
    );
}
