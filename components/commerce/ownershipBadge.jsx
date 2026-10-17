import { Badge } from "@/components/shadcn/badge";

import { LuCircleCheck } from "react-icons/lu";

// Only render this from server-confirmed ownership (details.owned or a successful entitlements query).
export function OwnershipBadge({ className, label = "Owned" }) {
    return (
        <Badge variant="success" className={className}>
            <LuCircleCheck aria-hidden="true" />
            {label}
        </Badge>
    );
}

export default OwnershipBadge;
