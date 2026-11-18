import { Suspense } from "react";
import RankingPage, { RankingSkeleton } from "@/components/ranking/rankingPage";
import { getAuthSession } from "@/lib/session";

export const metadata = {
    title: "Leaderboard | CodeDev",
    description: "Overall, EXP and points rankings of CodeDev learners",
};

export const instant = false;

// Suspense: the page reads ?board=&period= with useSearchParams.
export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<RankingSkeleton />}>
            <RankingPage viewerId={viewerId} />
        </Suspense>
    );
}
