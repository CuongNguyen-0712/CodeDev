import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";

export function initials(name = '') {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

/** Chat's avatar: the photo when there is one, else the initials. */
export default function UserAvatar({ name, image, className }) {
    return (
        <Avatar className={cn("size-9 shrink-0", className)}>
            <AvatarImage src={image || undefined} alt="" className="object-cover" />
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                {initials(name)}
            </AvatarFallback>
        </Avatar>
    );
}
