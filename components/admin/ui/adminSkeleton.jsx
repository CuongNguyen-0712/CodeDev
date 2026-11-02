import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading shapes for admin screens: they keep the frame the data will land in (a bordered card with
 * a header row and rows), so nothing jumps when it arrives. Announced once as "Loading".
 */
export function TableSkeleton({ rows = 6, columns = 4, label = "Loading", className }) {
    return (
        <div role="status" aria-label={label} className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
            <div className="flex gap-4 border-b border-border px-4 py-2.5">
                {Array.from({ length: columns }, (_, index) => (
                    <Skeleton key={index} className={cn("h-3", index === 0 ? "w-32" : "w-16", index >= 2 && "@max-2xl:hidden", index === columns - 1 && index > 0 && "ml-auto")} />
                ))}
            </div>
            <ul className="divide-y divide-border">
                {Array.from({ length: rows }, (_, index) => (
                    <li key={index} className="flex items-center gap-4 px-4 py-3">
                        <span className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-3.5" style={{ width: `${70 - (index % 3) * 15}%` }} />
                            <Skeleton className="h-3 w-1/3" />
                        </span>
                        <Skeleton className="h-5 w-16 rounded-full @max-2xl:hidden" />
                        <Skeleton className="h-8 w-8 rounded-md" />
                    </li>
                ))}
            </ul>
            <span className="sr-only">{label}</span>
        </div>
    );
}

/** The title row: a title bar and the finding line under it. */
export function HeaderSkeleton({ withAction = false }) {
    return (
        <div className="mb-6 flex items-start justify-between gap-6" aria-hidden="true">
            <div className="space-y-2.5">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-64 max-w-[60vw]" />
            </div>
            {withAction && <Skeleton className="h-8 w-24" />}
        </div>
    );
}

/** A strip of figures in one divided card, as the overview and system screens draw them. */
export function StripSkeleton({ cells = 4 }) {
    return (
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card @3xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: cells }, (_, index) => (
                <div key={index} className={cn("space-y-2 px-4 py-3.5", index % 2 === 1 && "border-l border-border", index > 1 && "border-t border-border @3xl:border-t-0", index === 2 && "@3xl:border-l")}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-12" />
                </div>
            ))}
        </div>
    );
}

/** What a screen shows while its server part loads: title row, a strip of figures and a table. */
export default function AdminPageSkeleton() {
    return (
        <div className="space-y-4">
            <HeaderSkeleton withAction />
            <StripSkeleton />
            <TableSkeleton rows={5} label="Loading this screen" />
        </div>
    );
}
