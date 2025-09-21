import { useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { useQuery } from '../router/router';

export default function useKey({ key, param, callback }) {
    const pathname = usePathname();
    const queryNavigate = useQuery();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === key) {
                e.preventDefault();
                if (typeof callback === 'function') {
                    callback();
                }
                else {
                    queryNavigate(pathname, { [param]: false });
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [key, callback]);
}