'use client';

import { useSession } from "next-auth/react";

/**
 * Renders its children only for a signed-in viewer, and so never on the server (the session is
 * known in the browser). Anything that reads the viewer's React Query cache stays out of the
 * prerendered shell: TanStack Query reads the clock while rendering, which a prerender rejects
 * (Cache Components, docs/rendering-strategy-plan.md).
 */
export function SignedIn({ children }) {
    const { status } = useSession();
    return status === "authenticated" ? children : null;
}
