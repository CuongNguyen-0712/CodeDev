import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

const TONES = {
    neutral: "text-foreground hover:bg-muted",
    primary: "text-primary-ink hover:bg-primary-soft hover:text-primary-ink",
    warning: "text-warning hover:bg-warning-soft hover:text-warning",
    danger: "text-destructive hover:bg-destructive-soft hover:text-destructive",
};

/**
 * An action on a table row or list item: icon and word, coloured by what it does. When the content
 * column is under 672px (a phone, or a tablet beside the sidebar) only the icon shows (a 36px target)
 * and the word stays for screen readers, so rows fit without scrolling sideways.
 */
export default function RowAction({ icon: Icon, label, tone = "neutral", className, ...props }) {
    return (
        <Button variant="ghost" size="sm" title={label} className={cn("@max-2xl:size-9 @max-2xl:px-0", TONES[tone], className)} {...props}>
            <Icon aria-hidden="true" />
            <span className="@max-2xl:sr-only">{label}</span>
        </Button>
    );
}
