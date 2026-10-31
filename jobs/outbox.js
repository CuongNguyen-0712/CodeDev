import { NonRetriableError } from "inngest";

import { inngest } from "@/lib/inngest";
import { deliverAuthOutboxEvent, killAuthOutboxEvent } from "@/services/authOutbox.service";

/**
 * One auth outbox row per run (event `outbox/created`, sent after the commit that wrote the row).
 * Throttled per event type: Gmail SMTP accepts only a few mails a minute from one account.
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
