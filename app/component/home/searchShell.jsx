'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const Search = dynamic(() => import('./search'), {
    ssr: false,
});

export default function SearchShell() {
    const pathname = usePathname();

    if (pathname === '/_not-found') {
        return null;
    }

    return <Search />;
}