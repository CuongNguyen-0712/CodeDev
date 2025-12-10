import Home from "../component/home/home";

import { Suspense } from "react";

import { LoadingRedirect } from "../component/ui/loading";

const pageTitles = {
    overview: {
        title: "Overview",
        description: "Welcome to CodeDev, your gateway to mastering coding skills...",
    },
    course: {
        title: "Course",
        description: "Explore our courses, find and start learning",
    },
    project: {
        title: "Project",
        description: "Discover projects to enhance your skills",
    },
    social: {
        title: "Social",
        description: "Connect with like-minded individuals",
    },
    roadmap: {
        title: "Roadmap",
        description: "Discover roadmap"
    },
    event: {
        title: "Event",
        description: "Join event"
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

    if (searchParams?.manage) {
        return {
            title: "Manage account | CodeDev",
            description: "Manage your account settings",
        };
    }

    const tab = searchParams?.name || "overview";
    const page = pageTitles[tab] || pageTitles.overview;

    return {
        title: `${page.title} | CodeDev`,
        description: page.description,
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Home />
        </Suspense>
    );
}
