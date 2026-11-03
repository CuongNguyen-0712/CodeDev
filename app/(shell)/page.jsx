import IndexPage from "@/components/index"

import { getCatalogStats } from "@/lib/cachedData"

export const metadata = {
    title: "CodeDev | Learn to code by writing code",
    description: "Short written lessons, each ending in a coding challenge you run against tests, with roadmaps for frontend, backend, DevOps and data roles.",
};

export default async function Page() {
    // Live catalog figures, cached 10 minutes (lib/cachedData). Without the database (a build
    // machine, an outage) the copy still reads, just without figures.
    const stats = await getCatalogStats().catch(() => null);

    return (
        <IndexPage stats={stats} />
    )
}
