import { NonRetriableError } from "inngest";

import { inngest } from "@/lib/inngest";
import { deliverAuthOutboxEvent, killAuthOutboxEvent } from "@/services/authOutbox.service";

/**
 * One auth outbox row per run (event `outbox/created`, sent after the commit that wrote the row).
 * Throttled per event type: the mail provider caps sends (AgentMail Free: 100 a day; Gmail: a few a minute).
 */
export const outboxDeliver = inngest.createFunction(
    {
        id: "outbox-deliver",
        triggers: [{ event: "outbox/created" }],
        idempotency: "event.data.id",
        concurrency: 2,
        throttle: { limit: 10, period: "1m" },
        retries: 5,
        onFailure: async ({ event, error }) => {
            await killAuthOutboxEvent(event.data.event.data.id, error?.message);
        },
    },
    async ({ event, step }) => {
        const id = event.data?.id;
        if (!id) throw new NonRetriableError("outbox/created without an id");
        return step.run("deliver", () => deliverAuthOutboxEvent(id));
    }
);
