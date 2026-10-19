import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";
import HomeLayout from "@/components/layouts/homeLayout";
import RankingPage from "@/components/ranking/rankingPage";

export const metadata = {
    title: "Leaderboard | CodeDev",
    description: "Overall, EXP and points rankings of CodeDev learners",
};

// Suspense: the page reads ?board=&period= with useSearchParams.
export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <RankingPage />
            </HomeLayout>
        </Suspense>
    );
}
