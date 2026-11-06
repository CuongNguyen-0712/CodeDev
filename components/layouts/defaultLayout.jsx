'use client';

// Toasts are rendered once by the root providers (AppToaster), not per page layout.
// `enter`: sections rise in on load (.page-enter); off for full-screen tools like the learning workspace.
function LayoutContent({ children, enter }) {
    return (
        // A div, not a <section>: page <header>s inside a section lose their banner landmark.
        // *:shrink-0: a page taller than the screen keeps its height and scrolls (Safari shrank it to
        // the screen and drew the rest over it).
        <div className={`${enter ? 'page-enter ' : ''}flex h-dvh w-full flex-col overflow-y-auto bg-background *:shrink-0`}>
            {children}
        </div>
    )
}

export default function DefaultLayout({ children, enter = true }) {
    return (
        <LayoutContent enter={enter}>
            {children}
        </LayoutContent>
    );
}
