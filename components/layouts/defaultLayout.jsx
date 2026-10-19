'use client';

// Toasts are rendered once by the root providers (AppToaster), not per page layout.
function LayoutContent({ children }) {
    return (
        <section className='flex h-dvh w-full flex-col overflow-y-auto bg-background'>
            {children}
        </section>
    )
}

export default function DefaultLayout({ children }) {
    return (
        <LayoutContent>
            {children}
        </LayoutContent>
    );
}
