import NotFound from "@/components/ui/pageNotFound";

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
};

// Rendered when a page calls notFound() (unknown course or roadmap). Unmatched URLs use
// app/global-not-found.jsx instead.
export default function NotFoundPage() {
    return <NotFound />;
}
