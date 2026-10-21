import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";

import { LuCrown } from "react-icons/lu";

import { formatMoney, formatPoints, isPremium, offersOf } from "./format";

/**
 * Price of a course: "Free", or "Premium" with the money price and / or the points price.
 * Accepts a course details response (`offers`) or a list item (`money_price` / `points_price`).
 */
export function PriceTag({ course, className }) {
    if (!course) return null;

    if (!isPremium(course)) {
        return <Badge variant="success" className={className}>Free</Badge>;
    }

    const { money, points } = offersOf(course);
    const moneyLabel = money ? formatMoney(money.amountMinor, money.currency) : null;
    const pointsLabel = points ? formatPoints(points) : null;

    const description = [
        'Premium course',
        moneyLabel && `price ${moneyLabel}`,
        pointsLabel && `${moneyLabel ? 'or ' : ''}${pointsLabel}`,
    ].filter(Boolean).join(', ');

    return (
        <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)} aria-label={description}>
            <Badge variant="primary" aria-hidden="true">
                <LuCrown aria-hidden="true" />
                Premium
            </Badge>
            {moneyLabel && (
                <span className="text-xs font-medium text-foreground tabular" aria-hidden="true">
                    {moneyLabel}
                </span>
            )}
            {pointsLabel && (
                <span className="text-xs text-muted-foreground tabular" aria-hidden="true">
                    {moneyLabel ? `or ${pointsLabel}` : pointsLabel}
                </span>
            )}
        </span>
    );
}

export default PriceTag;
