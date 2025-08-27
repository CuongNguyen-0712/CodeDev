import { useEffect, useRef } from "react";

export default function useOutside({ setStateOutside, stateOutside }) {
    const ref = useRef(null)

    const handleRefOutside = (e) => {
        if (!ref.current) return;

        if (ref.current && !ref.current.contains(e.target)) {
            setStateOutside()
        }
    }

    useEffect(() => {
        document.addEventListener('click', handleRefOutside)

        return () => {
            document.removeEventListener('click', handleRefOutside)
        }
    }, [stateOutside])

    return ref
}