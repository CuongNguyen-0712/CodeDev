import { cn } from "@/lib/utils";

import { LuUsers } from "react-icons/lu";

/** A team's avatar: the group icon in a muted circle, the size of chat's UserAvatar. */
export default function TeamAvatar({ className }) {
    return (
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground", className)}>
            <LuUsers className="size-4" aria-hidden="true" />
        </span>
    );
}
