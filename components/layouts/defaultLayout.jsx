'use client';

// Toasts are rendered once by the root providers (AppToaster), not per page layout.
// `enter`: sections rise in on load (.page-enter); off for full-screen tools like the learning workspace.
function LayoutContent({ children, enter }) {
    return (
        // A div, not a <section>: page <header>s inside a section lose their banner landmark.
        <div className={`${enter ? 'page-enter ' : ''}flex h-dvh w-full flex-col overflow-y-auto bg-background`}>
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
