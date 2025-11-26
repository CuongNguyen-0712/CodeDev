import Home from "../component/home/home"
import { Suspense } from "react"

import { LoadingRedirect } from "../component/ui/loading"

export const metadata = {
    title: 'Home | CodeDev',
    description: 'Welcome to CodeDev, your gateway to mastering coding skills with expert-led courses and hands-on projects.',
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Home />
        </Suspense>
    )
}