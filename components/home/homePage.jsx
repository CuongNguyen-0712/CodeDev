'use client';
import HomeOverview from "./overview";
import HomeRecommend from "./recommend";
import HomeLearning from "./learning";

export default function HomePage() {
    return (
        <div id="overview" className="@container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 lg:gap-8 lg:pt-10 lg:pb-10">
            <HomeOverview />

            {/* Progress comes first on small screens; on lg it moves into the right column. */}
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
                <HomeLearning />
                <HomeRecommend />
            </div>
        </div>
    )
}
