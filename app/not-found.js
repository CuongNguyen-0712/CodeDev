import NotFound from "./component/ui/pageNotFound"

export async function generateMetadata() {
    return {
        title: "Page not found | CodeDev",
        description: "The page you are looking for does not exist.",
    }
}

export default function PageNotFound() {
    return <NotFound />
}
