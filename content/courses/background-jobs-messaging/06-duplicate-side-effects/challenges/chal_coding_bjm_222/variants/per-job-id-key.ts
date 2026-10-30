import { readFileSync } from "node:fs";

// CodeDev - the "certificate ready" email.
//
// When a learner completes a course, the certificate service enqueues a send_email job:
//   payload = { certificateId, email, courseTitle }
// The queue delivers at least once. A job is delivered again when the worker crashes, when its
// ack is lost, when the provider call fails, and sometimes the certificate service enqueues a
// second job for the same certificate. Since this handler shipped, some learners get the email
// two or three times.
//
// Fix sendCertificateReady so that each certificate produces exactly ONE delivered email:
//   - when the same job is delivered again after the email went out (lost ack);
//   - when a second job for the same certificate arrives;
//   - when the worker crashes right after the provider accepted the email (nothing after the
//     send call runs, the job is not acked and comes back);
//   - when the provider accepts the email but its answer is lost (send rejects with a timeout);
//   - when two workers handle the same job at the same moment;
//   - when the job comes back days later (a replay), long after the provider forgot its keys.
// A delivery must still FAIL (let the error propagate) when the provider call fails, so the queue
// retries it; never swallow the error, never retry inside the handler.
//
// What you can use (both survive crashes; their state is shared by every worker):
//   deps.store  - a durable key-value table: get(key) -> value or undefined, set(key, value).
//   deps.email  - the email provider. send(email, { idempotencyKey }) - a send repeated with the
//                 same idempotencyKey within 24 hours of the first accepted one returns the first
//                 { messageId } and does not deliver again. After 24 hours the key is forgotten.

type Job = { id: string; type: string; payload: Record<string, unknown>; attempts: number; enqueuedAt: number };
type Email = { to: string; template: "certificate_ready"; certificateId: string; courseTitle: string };
interface Store {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
}
interface EmailProvider {
    send(email: Email, options?: { idempotencyKey?: string }): Promise<{ messageId: string }>;
}
type Deps = { store: Store; email: EmailProvider };

async function sendCertificateReady(job: Job, deps: Deps): Promise<void> {
    const certificateId = String(job.payload.certificateId);
    const key = `certificate_ready:${job.id}`; // one key per job

    if ((await deps.store.get(key)) === "sent") return;

    await deps.store.set(key, "sending");
    await deps.email.send(
        {
            to: String(job.payload.email),
            template: "certificate_ready",
            certificateId,
            courseTitle: String(job.payload.courseTitle),
        },
        { idempotencyKey: key },
    );
    await deps.store.set(key, "sent");
}

// ---------------------------------------------------------------- test runner (do not change)
// Replays one scripted test case (JSON on stdin) against fake infrastructure and prints
// { outcomes: one per delivery ("acked" | "failed" | "crashed"), emails: every email delivered }.
type Fault = "provider_down" | "send_timeout" | "crash_after_send";
type Step = { deliver: string; at: number; fault?: Fault } | { concurrently: string[]; at: number };
type Case = { jobs: Record<string, Record<string, unknown>>; steps: Step[] };

class ProcessCrash extends Error {}

const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const durable = new Map<string, string>();
const providerKeys = new Map<string, { messageId: string; acceptedAt: number }>();
const delivered: string[] = [];
const deliveries = new Map<string, number>();
let now = 0;
let nextMessage = 1;

function makeDeps(fault: Fault | undefined, worker: { dead: boolean }): Deps {
    const alive = (): void => {
        if (worker.dead) throw new ProcessCrash("worker process is gone");
    };
    return {
        store: {
            async get(key: string): Promise<string | undefined> {
                alive();
                return durable.get(key);
            },
            async set(key: string, value: string): Promise<void> {
                alive();
                durable.set(key, value);
            },
        },
        email: {
            async send(email: Email, options?: { idempotencyKey?: string }): Promise<{ messageId: string }> {
                alive();
                if (fault === "provider_down") throw new Error("503 Service Unavailable: email not accepted");
                const key = options?.idempotencyKey;
                const seen = key === undefined ? undefined : providerKeys.get(key);
                let messageId: string;
                if (seen !== undefined && now - seen.acceptedAt < KEY_TTL_MS) {
                    messageId = seen.messageId;
                } else {
                    messageId = `msg-${nextMessage++}`;
                    delivered.push(`${email.template} ${email.certificateId} ${email.to}`);
                    if (key !== undefined) providerKeys.set(key, { messageId, acceptedAt: now });
                }
                if (fault === "send_timeout") throw new Error("timeout: no answer from the email provider after 10000 ms");
                if (fault === "crash_after_send") {
                    worker.dead = true;
                    throw new ProcessCrash("worker killed (OOM) right after the provider accepted the email");
                }
                return { messageId };
            },
        },
    };
}

async function deliver(test: Case, jobId: string, fault?: Fault): Promise<string> {
    const attempts = (deliveries.get(jobId) ?? 0) + 1;
    deliveries.set(jobId, attempts);
    const job: Job = { id: jobId, type: "send_email", payload: { ...test.jobs[jobId] }, attempts, enqueuedAt: 0 };
    const worker = { dead: false };
    try {
        await sendCertificateReady(job, makeDeps(fault, worker));
    } catch {
        if (!worker.dead) return "failed";
    }
    return worker.dead ? "crashed" : "acked";
}

async function main(): Promise<void> {
    const test: Case = JSON.parse(readFileSync(0, "utf8"));
    const outcomes: string[] = [];
    for (const step of test.steps) {
        now = step.at;
        if ("concurrently" in step) {
            outcomes.push(...(await Promise.all(step.concurrently.map((id) => deliver(test, id)))));
        } else {
            outcomes.push(await deliver(test, step.deliver, step.fault));
        }
    }
    console.log(JSON.stringify({ outcomes, emails: delivered }));
}

main().catch((error) => console.log(JSON.stringify({ error: String(error) })));
