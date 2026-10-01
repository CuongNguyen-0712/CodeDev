import '@/app/globals.css';

import { Suspense } from "react"

import { LoadingRedirect } from "@/components/ui/loading"
import Forbidden from "@/components/ui/forbidden"

export async function generateMetadata() {
    return {
        title: 'Access Denied | CodeDev',
        description: 'You do not have permission to access this resource. Please check your credentials or contact your administrator for assistance.',
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Forbidden />
        </Suspense>
    )
}