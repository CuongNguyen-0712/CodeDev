/**
 * Screen title row (docs/admin-panel-plan.md 5.2): a noun as the h1, one grey line with the
 * finding of the data (never a description of the interface), at most one primary action.
 */
export default function PageHeader({ title, description, actions, children }) {
    return (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{title}</h1>
                    {children}
                </div>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}
