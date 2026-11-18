import { Skeleton } from "@/components/shadcn/skeleton";

export function AuthCardSkeleton() {
    return (
        <section className="flex w-full max-w-md flex-col items-start gap-5" aria-hidden="true">
            <Skeleton className="size-6 rounded-full" />
            <div className="flex w-full flex-col gap-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72 max-w-[80vw]" />
                <Skeleton className="h-4 w-56 max-w-[65vw]" />
            </div>
            <Skeleton className="h-9 w-36 rounded-md" />
        </section>
    );
}

export default AuthCardSkeleton;
