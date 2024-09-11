'use client'

import { useRouter } from 'next/navigation'
export default function Info() {

    const router = useRouter();

    return (
        <main id="main">
            <h1>Info</h1>
            <button onClick={() => router.push('/main')}>Back</button>
        </main>
    )
}