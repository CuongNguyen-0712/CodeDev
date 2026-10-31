import { codeRun } from "@/jobs/codeRun";
import { accountMaintenance, expAudit } from "@/jobs/crons";
import { deadLetterSink } from "@/jobs/deadLetters";
import { outboxDeliver } from "@/jobs/outbox";
import { sweeper } from "@/jobs/sweeper";

/** Every Inngest function, served by app/api/inngest/route.js. */
export const functions = [codeRun, outboxDeliver, sweeper, accountMaintenance, expAudit, deadLetterSink];
