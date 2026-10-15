'use client';
import HomeOverview from "./overview";
import HomeRecommend from "./recommend";
import HomeLearning from "./learning";

export default function HomePage() {
    return (
        <div id="overview" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <HomeOverview />

            {/* Progress comes first on small screens; on lg it moves into the right column. */}
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <HomeLearning />
                <HomeRecommend />
            </div>
        </div>
    )
}
