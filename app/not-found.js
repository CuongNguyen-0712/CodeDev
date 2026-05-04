import { Suspense } from "react"
import NotFound from "./component/ui/pageNotFound"
import { LoadingContent } from "./component/ui/loading"

export async function generateMetadata() {
    return {
        title: "Page not found | CodeDev",
        description: "The page you are looking for does not exist.",
    }
}

export default function PageNotFound() {
    return (
        <Suspense fallback={<LoadingContent />}>
            <NotFound />
        </Suspense>
    )
}
