import { chatAttachmentDelete, chatOrphanAttachments, chatPush } from "@/jobs/chat";
import { announcementSend } from "@/jobs/announcement";
import { codeRun } from "@/jobs/codeRun";
import { accountMaintenance, blogPurge, expAudit, rankingRefresh } from "@/jobs/crons";
import { deadLetterSink } from "@/jobs/deadLetters";
import { outboxDeliver } from "@/jobs/outbox";
import { sweeper } from "@/jobs/sweeper";

/** Every Inngest function, served by app/api/inngest/route.js. */
export const functions = [codeRun, outboxDeliver, sweeper, accountMaintenance, expAudit, rankingRefresh, blogPurge, deadLetterSink, announcementSend, chatPush, chatAttachmentDelete, chatOrphanAttachments];
