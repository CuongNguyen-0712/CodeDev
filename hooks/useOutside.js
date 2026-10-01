import { useEffect, useRef } from 'react';

export default function useOutside({ stateOutside, setStateOutside }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!stateOutside) return;

        const handleClickOutside = (event) => {
            if (!ref.current?.contains(event.target)) {
                setStateOutside(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [stateOutside, setStateOutside]);

    return ref;
}