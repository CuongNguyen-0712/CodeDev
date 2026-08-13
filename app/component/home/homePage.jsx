'use client';
import HomeOverview from "./overview";
import HomeLearning from "./learning";

export default function HomePage() {
    return (
        <div className='shared_section' id="overview">
            <HomeOverview />
            <HomeLearning />
        </div>
    )
}
