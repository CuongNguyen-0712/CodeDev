'use client'

import { useRouter } from "next/navigation"
export default function Settings() {

    const router = useRouter();

    return (
        <main id="main">
            <h1>Hello</h1>
            <button onClick={() => router.push('/main')}>Back</button>
        </main>
    )
}