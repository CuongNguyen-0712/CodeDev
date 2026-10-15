'use client'
import Link from 'next/link';

import { useRouterActions } from '@/router/useRouterActions';

import { Button } from '@/components/shadcn/button';

import { LuArrowLeft, LuCompass, LuHouse } from "react-icons/lu";

export default function NotFound() {
    const { navigateBack } = useRouterActions();

    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6 py-16">
            <div className="flex max-w-md flex-col items-start gap-5">
                <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <LuCompass className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                    <p className="font-mono text-sm text-muted-foreground">Error 404</p>
                    <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        The page you are looking for does not exist or has been moved.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => navigateBack()}>
                        <LuArrowLeft />
                        Go back
                    </Button>
                    <Button asChild>
                        <Link href="/"><LuHouse />Home</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
