import { Inngest } from "inngest";

/**
 * Inngest client (docs/queue-execution-plan.md). Functions live in inngest/functions/ and are
 * served by app/api/inngest/route.js. Keys come from the environment:
 *
 *   INNGEST_EVENT_KEY    sends events (production)
 *   INNGEST_SIGNING_KEY  verifies Inngest's calls to /api/inngest (production)
 *   INNGEST_DEV=1        local dev server (`npx inngest-cli@latest dev`), no keys needed
 *
 * Until one of them is set, background work runs inline as before: the outbox right after the
 * commit, code runs inside the server action.
 */
export const inngest = new Inngest({ id: "codedev" });

export function inngestEnabled() {
    const dev = process.env.INNGEST_DEV && !["0", "false"].includes(String(process.env.INNGEST_DEV).toLowerCase());
    return Boolean(process.env.INNGEST_EVENT_KEY || dev);
}

/** Outbox events go through Inngest unless OUTBOX_DELIVERY=inline (rollback switch). */
export function outboxViaInngest() {
    return inngestEnabled() && process.env.OUTBOX_DELIVERY !== "inline";
}

/** Code runs are queued through Inngest unless CODE_EXEC_MODE=sync (rollback switch). */
export function codeRunsViaInngest() {
    return inngestEnabled() && process.env.CODE_EXEC_MODE !== "sync";
}
