'use client';

import SearchShell from '../component/home/searchShell';

export default function HomeLayout({ children }) {
    return (
        <>
            {children}
            <SearchShell />
        </>
    );
}
