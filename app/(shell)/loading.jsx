import { PageSkeleton } from "@/components/ui/loading";

// Shown inside the shell while a page's server work runs (e.g. /home's onboarding check).
export default function Loading() {
    return <PageSkeleton />;
}
