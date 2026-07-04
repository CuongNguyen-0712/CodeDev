import HomePage from "./component/homepage/content"
import { Suspense } from "react"

import HomeLayout from "./layout/homeLayout"

import { LoadingRedirect } from "./component/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <HomePage />
            </HomeLayout>
        </Suspense>
    )
}