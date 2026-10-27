import { readFileSync } from "node:fs";

// Certificate emails sent twice. When a learner completes a course, CodeDev enqueues a job and the
// certificate worker emails the certificate. Since the workers moved to spot instances, some learners
// get the same email two or three times. The queue delivers at least once: a worker that dies after
// sending the email but before writing "sent" leaves the job to be delivered again, and a worker that
// is slower than the visibility timeout sees a second worker pick up the same job while it is running.
//
// Fix sendCertificateEmail so that each certificate email is delivered once, with this protocol:
//   key = "certificate-email/<certId>" (the same for every delivery of that certificate)
//   1. read the certificate; unknown, "sent" or "needs-review": do nothing
//   2. "pending": claim it with db.update(id, "pending", { status: "sending", claimedAt: now });
//      if the claim fails, another worker changed it first: read it again and continue from step 1
//   3. "sending" claimed less than 24 h (86,400 s) ago: send with idempotencyKey = key, then
//      db.update(id, "sending", { status: "sent" })
//   4. "sending" claimed 24 h ago or more: do not send (the provider no longer remembers the key);
//      db.update(id, "sending", { status: "needs-review" }) so a person checks the provider's log
// The email provider fake delivers at most once per idempotencyKey within 24 h.
// Do not change the fakes or the test runner.

type Status = "pending" | "sending" | "sent" | "needs-review";
type Certificate = { id: string; learner: string; email: string; course: string; status: Status; claimedAt: number | null };
type Job = { certId: string; delivery: string };
type Email = { to: string; template: string; certId: string; idempotencyKey?: string };
type Ctx = {
    now(): number; // seconds
    db: {
        get(id: string): Promise<Certificate | null>;
        /** Compare-and-set: applies the patch only if the current status is `expected`. Returns whether it did. */
        update(id: string, expected: Status, patch: { status: Status; claimedAt?: number }): Promise<boolean>;
    };
    email: { send(email: Email): Promise<"delivered" | "duplicate"> };
};

const DAY_SECONDS = 86_400;

async function sendCertificateEmail(job: Job, ctx: Ctx): Promise<void> {
    const cert = await ctx.db.get(job.certId);
    if (!cert || cert.status !== "pending") return; // already sent, or unknown certificate
    await ctx.email.send({ to: cert.email, template: "certificate-issued", certId: cert.id });
    await ctx.db.update(cert.id, "pending", { status: "sent" });
}

// ---------------------------------------------------------------- fakes and test runner (do not change)
// Input: { certificates: [...], script: [...] }. The script plays the broker and the infrastructure:
//   { at, deliver: "A", cert, crashAfter?: op, pauseAfter?: op }  starts worker A on a delivery of the job
//   { at, resume: "A" }                                           lets a paused worker continue
// op is "get", "update" or "send": the worker stops right after its first call of that operation has
// taken effect. A crashed worker never continues (the process died); a paused one continues on resume.
// `at` is the clock in seconds for everything that runs during that script step.
// Output: emails delivered per learner, the final status of every certificate, and worker errors.
type Op = "get" | "update" | "send";
type Step = { at: number; deliver?: string; cert?: string; crashAfter?: Op; pauseAfter?: Op; resume?: string };
type Input = { certificates: Omit<Certificate, "claimedAt">[]; script: Step[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const table = new Map<string, Certificate>(input.certificates.map((c) => [c.id, { ...c, claimedAt: null }]));
const delivered = new Map<string, number>(input.certificates.map((c) => [c.learner, 0]));
const keys = new Map<string, number>();
const errors: string[] = [];
const resumers = new Map<string, () => void>();
let clock = 0;

function makeCtx(worker: string, crashAfter?: Op, pauseAfter?: Op): Ctx {
    const seen = new Set<Op>();
    const after = async (op: Op): Promise<void> => {
        const first = !seen.has(op);
        seen.add(op);
        if (first && op === crashAfter) await new Promise<void>(() => {}); // the process died here
        if (first && op === pauseAfter) await new Promise<void>((resolve) => resumers.set(worker, resolve));
    };
    return {
        now: () => clock,
        db: {
            async get(id) {
                const row = table.get(id);
                const copy = row ? { ...row } : null;
                await after("get");
                return copy;
            },
            async update(id, expected, patch) {
                const row = table.get(id);
                const ok = !!row && row.status === expected;
                if (row && ok) Object.assign(row, patch);
                await after("update");
                return ok;
            },
        },
        email: {
            async send(email) {
                const cert = table.get(email.certId);
                const sentAt = email.idempotencyKey === undefined ? undefined : keys.get(email.idempotencyKey);
                let result: "delivered" | "duplicate" = "duplicate";
                if (sentAt === undefined || clock - sentAt >= DAY_SECONDS) {
                    result = "delivered";
                    if (email.idempotencyKey !== undefined) keys.set(email.idempotencyKey, clock);
                    if (cert) delivered.set(cert.learner, (delivered.get(cert.learner) ?? 0) + 1);
                }
                await after("send");
                return result;
            },
        },
    };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function main(): Promise<void> {
    for (const step of input.script) {
        clock = step.at;
        if (step.deliver && step.cert) {
            const worker = step.deliver;
            sendCertificateEmail({ certId: step.cert, delivery: worker }, makeCtx(worker, step.crashAfter, step.pauseAfter)).catch((err: unknown) =>
                errors.push(`${worker}: ${err instanceof Error ? err.message : String(err)}`),
            );
        } else if (step.resume) {
            resumers.get(step.resume)?.();
            resumers.delete(step.resume);
        }
        await settle();
    }
    console.log(JSON.stringify({
        emailsPerLearner: Object.fromEntries(delivered),
        certificates: Object.fromEntries([...table.values()].map((c) => [c.id, c.status])),
        errors,
    }, null, 2));
}
main();
