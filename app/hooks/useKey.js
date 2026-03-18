'use client'

import { useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function useKey({ key = 'Escape', param }) {
    const router = useRouter()
    const pathname = usePathname()

    const handleKey = useCallback((event) => {
        if (event.key !== key) return

        const currentParams = new URLSearchParams(window.location.search)

        if (!currentParams.get(param)) return

        currentParams.delete(param)

        const queryString = currentParams.toString()

        router.push(
            queryString ? `${pathname}?${queryString}` : pathname,
            { scroll: false }
        )
    }, [key, param, router, pathname])

    useEffect(() => {
        window.addEventListener('keydown', handleKey)
        return () => {
            window.removeEventListener('keydown', handleKey)
        }
    }, [handleKey])
}