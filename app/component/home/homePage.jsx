'use client';
import HomeOverview from "./overview";
import HomeLearning from "./learning";

export default function HomePage() {

    return (
        <div id="overview">
            <div id="overview_content">
                <HomeOverview />
            </div>
            <HomeLearning />
        </div>
    )
}
