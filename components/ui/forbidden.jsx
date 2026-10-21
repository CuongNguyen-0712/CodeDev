'use client'

import { useRouterActions } from '@/router/useRouterActions';

import { Button } from '@/components/shadcn/button';

import { LuArrowLeft, LuHouse } from "react-icons/lu";

export default function Forbidden() {
    const { navigateBack, navigate } = useRouterActions();

    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6 py-16">
            <div className="flex max-w-md flex-col items-start gap-5">
                <div className="space-y-2">
                    <h1 className="text-5xl font-semibold tracking-[-0.03em]">Access forbidden</h1>
                    <p className="text-base leading-relaxed text-muted-foreground">
                        Error 403. Your account does not have permission to view this page. If you think this is a
                        mistake, sign in with another account or contact an administrator.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => navigateBack()}>
                        <LuArrowLeft />
                        Go back
                    </Button>
                    <Button onClick={() => navigate({ path: '/home' })}>
                        <LuHouse />
                        Return home
                    </Button>
                </div>
            </div>
        </main>
    );
}
