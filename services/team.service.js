import { ulid } from "ulid";
import { z } from "zod";
import { chatDb } from "@/db/chat.db";
import { teamDb } from "@/db/team.db";
import { dbPool } from "@/lib/db";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { runAfter } from "@/lib/runAfter";
import { createTeamSchema, inviteSchema, teamIdSchema, teamNameSchema } from "@/lib/validation/team";
import { parseOrThrow } from "@/lib/validation/premium";
import { chatService } from "@/services/chat.service";
import { queueAttachmentDelete } from "@/services/chatJobs.service";
import { chatRealtime } from "@/services/chatRealtime.service";
import { notificationService } from "@/services/notification.service";

const TEAM_SIZE = 5;

const teamNotFound = () => new ApiError("Team not found", 404);
const userNotFound = () => new ApiError("User not found", 404);
const cantInvite = () => new ApiError("Can't invite this person", 403);
const teamFull = () => new ApiError("This team is full", 409);

const respondSchema = z.object({ teamId: teamIdSchema, accept: z.boolean() });
const removeSchema = z.object({ teamId: teamIdSchema, targetId: z.string().min(1, "Invalid user id").max(64, "Invalid user id") });
const renameSchema = z.object({ teamId: teamIdSchema, name: teamNameSchema });

/** Public ids of the team's members with `status`, read after commit; [] (logged) when the read fails. */
async function committedMemberIds(teamId, status) {
    try {
        return await teamDb.memberIds(dbPool, teamId, status);
    } catch (error) {
        console.error("[team] reading members after commit", error);
        return [];
    }
}

/**
 * The single post-commit seam (rule 10). `{ teamId, change, joined?, left?, target?, ended?, pendingIds?, invited?,
 * teamName?, actor?, newHost? }`: `change` is the `team-updated` change; `joined` are public ids synced into the team
 * conversation (to their committed team status); `left` already left it in the team transaction, their post-commit sync
 * only fires the chat event; once `ended` the conversation is gone, so `left` is not synced. `invited` (`{ id, invitedAt }`)
 * get a team_invite from `actor`; `newHost` (`{ public_id, joined_at }`) gets a team_host after `actor` left.
 * Joining is awaited here, not deferred, so the caller gets the conversation id (the UI opens the team chat from it);
 * a failure of either call is logged, the committed change stays, and the id is null even if the conversation exists
 * (accept re-ensures it and re-syncs every approved member, rule 4).
 * `about` is the public id the change is about (the event's `userId`; recipients of a host handover get the new host);
 * `chatId` is the team conversation's public id when the team row is already gone (ended), else it is read here.
 * Everything else goes through runAfter. Returns the conversation id, or null when nobody joined or the chat failed.
 */
async function afterTeamChange({
    teamId, change, joined = [], left = [], target = null, ended = false, pendingIds = [], invited = [], teamName, actor, newHost = null, about = null, chatId = null,
}) {
    let conversationId = null;
    if (joined.length) {
        try {
            conversationId = (await chatService.ensureTeamConversation(teamId)).id;
            for (const id of joined) await chatService.syncTeamMember(teamId, id, "joined");
        } catch (error) {
            console.error("[team] joining the team conversation", error);
            conversationId = null;
        }
    }
    if (!ended) for (const id of left) await runAfter(() => chatService.syncTeamMember(teamId, id, "left"));

    for (const { id, invitedAt } of invited) {
        await runAfter(() => notificationService.notify(id, {
            kind: "team_invite", title: "New team invitation", message: `${actor} invited you to join ${teamName}.`,
            link: "/contact?tab=invitations", dedupeKey: `${teamId}:${invitedAt.getTime()}`,
        }));
    }
    if (newHost) {
        await runAfter(async () => {
            const chatId = (await teamDb.summary(teamId))?.conversationId;
            await notificationService.notify(newHost.public_id, {
                kind: "team_host", title: "You're the team host now", message: `${actor} left ${teamName}, so you now host the team.`,
                link: chatId ? `/messages/${chatId}` : "/messages", dedupeKey: `${teamId}:${newHost.joined_at.getTime()}`,
            });
        });
    }

    // Once ended nobody is a member any more: only the people named here hear about it.
    const approved = ended ? [] : await committedMemberIds(teamId, "approved");
    const pending = ended ? [] : await committedMemberIds(teamId, "pending");
    if (change === "renamed") {
        await runAfter(async () => {
            const chatId = (await teamDb.summary(teamId))?.conversationId;
            if (chatId) await chatRealtime.conversationUpdated({ conversationId: chatId, members: approved });
        });
    }
    const subjects = [...left, ...pendingIds, ...(target ? [target] : [])];
    let conversationRef = chatId;
    if (!conversationRef && !ended) {
        try {
            conversationRef = (await teamDb.summary(teamId))?.conversationId ?? null;
        } catch (error) {
            console.error("[team] reading the team conversation after commit", error);
        }
    }
    for (const id of dedupe([...approved, ...pending, ...joined, ...subjects])) {
        const isHost = Boolean(newHost) && !subjects.includes(id);
        const payload = { teamId, change: isHost ? "host" : change, conversationId: conversationRef ?? null, userId: isHost ? newHost.public_id : about };
        await runAfter(() => publishToUser(id, events.TEAM_UPDATED, payload));
    }
    return conversationId;
}

/** Rule 3 for each new invitee: an existing, active, accepted friend of the host, with no block either way. */
async function checkInvitees(client, hostDbId, people, publicIds) {
    if (people.length !== publicIds.length || people.some((p) => p.status !== "active")) throw userNotFound();
    for (const person of people) {
        if (!person.friend || await chatDb.isBlocked(client, hostDbId, person.id)) throw cantInvite();
    }
}

async function invitePending(client, teamId, people) {
    const invited = [];
    for (const person of people) {
        const row = await teamDb.upsertMember(client, { teamId, userDbId: person.id, status: "pending" });
        invited.push({ id: person.public_id, invitedAt: row.updated_at });
    }
    return invited;
}

/** Locks the team, then reads the caller; 404 unless they are an approved member, 403 when `hostOnly` and they are not the host. */
async function lockForMember(client, teamId, userId, { hostOnly = false } = {}) {
    const team = await teamDb.lockTeam(client, teamId);
    if (!team) throw teamNotFound();
    const [me] = await teamDb.people(client, { teamId, friendOfDbId: null, publicIds: [userId] });
    if (me?.member_status !== "approved") throw teamNotFound();
    if (hostOnly && me.id !== team.host_id) throw new ApiError("Only the team host can do this", 403);
    return { team, me };
}

// 18 digits: every value fits a bigint (19 could pass its max and 500).
const TEAM_MEMBER_ROW_ID = /^\d{1,18}$/;

const dedupe = (list) => [...new Set(list)];

export const teamService = {
    /** Rule 9: approved members only (404 otherwise); only the host also sees the invited. */
    members: async ({ userId, teamId }) => {
        parseOrThrow(teamIdSchema, teamId);
        const team = await teamDb.teamFor(teamId, userId);
        if (team?.member_status !== "approved") throw teamNotFound();
        const all = await teamDb.members(teamId);
        const isHost = all.some((m) => m.role === "host" && m.id === userId);
        return { team: { id: team.id, name: team.name }, items: isHost ? all : all.filter((m) => m.role !== "invited") };
    },

    /** The caller's pending team invitations, newest first, keyset on (updated_at, id). */
    listInvitations: async ({ userId, cursor = null, limit = 20 }) => {
        const rows = await teamDb.listInvitations({ userId, cursor: decodeCursor(cursor, TEAM_MEMBER_ROW_ID), limit: limit + 1 });
        const page = pageOf(rows, limit, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        const items = page.items.map(({ team_id, team_name, invited_at, ...invitedBy }) => ({
            team: { id: team_id, name: team_name }, invitedBy, invitedAt: invited_at,
        }));
        return { items, nextCursor: page.nextCursor };
    },

    /** Rule 1: the caller hosts a new team of 5 seats with 1–4 friends invited; one invalid invitee fails it all. */
    create: async ({ userId, name, memberIds }) => {
        const input = parseOrThrow(createTeamSchema, { name, memberIds });
        const ids = dedupe(input.memberIds);
        const teamId = `team_${ulid().toLowerCase()}`;
        const { invited, actor } = await withTransaction(async (client) => {
            const [me] = await teamDb.people(client, { teamId: null, friendOfDbId: null, publicIds: [userId] });
            if (!me) throw userNotFound();
            const people = await teamDb.people(client, { teamId: null, friendOfDbId: me.id, publicIds: ids });
            await checkInvitees(client, me.id, people, ids);
            await teamDb.insertTeam(client, { id: teamId, name: input.name, hostDbId: me.id });
            await teamDb.upsertMember(client, { teamId, userDbId: me.id, status: "approved" });
            return { invited: await invitePending(client, teamId, people), actor: me.username };
        });
        const conversationId = await afterTeamChange({ teamId, change: "invited", joined: [userId], invited, teamName: input.name, actor, about: invited[0]?.id ?? userId });
        const team = await teamDb.summary(teamId);
        return { team: team && { ...team, conversationId } };
    },

    /** Rule 2: host only; approved / pending people are skipped; approved + pending stays ≤ 5. */
    invite: async ({ userId, teamId, userIds }) => {
        const input = parseOrThrow(inviteSchema, { teamId, userIds });
        const ids = dedupe(input.userIds);
        const { invited, ...names } = await withTransaction(async (client) => {
            const { team, me } = await lockForMember(client, teamId, userId, { hostOnly: true });
            const people = await teamDb.people(client, { teamId, friendOfDbId: me.id, publicIds: ids });
            const fresh = people.filter((p) => p.member_status !== "approved" && p.member_status !== "pending");
            if (people.length !== ids.length) throw userNotFound();
            const { approved, pending } = await teamDb.capacity(client, teamId);
            if (approved + pending + fresh.length > TEAM_SIZE) throw teamFull();
            await checkInvitees(client, me.id, fresh, fresh.map((p) => p.public_id));
            return { invited: await invitePending(client, teamId, fresh), teamName: team.name, actor: me.username };
        });
        if (invited.length) await afterTeamChange({ teamId, change: "invited", invited, about: invited[0].id, ...names });
        return { team: await teamDb.summary(teamId) };
    },

    /** Rule 4: the invitee of a pending row; accept → approved and into the team conversation, decline → rejected. */
    respond: async ({ userId, teamId, accept }) => {
        parseOrThrow(respondSchema, { teamId, accept });
        const approvedIds = await withTransaction(async (client) => {
            const team = await teamDb.lockTeam(client, teamId);
            if (!team) throw teamNotFound();
            const [me] = await teamDb.people(client, { teamId, friendOfDbId: null, publicIds: [userId] });
            if (!me?.member_status) throw teamNotFound();
            if (me.member_status !== "pending") throw new ApiError("This invitation is no longer pending", 409);
            // A block since the invite (either way, with the current host) ends it; the row stays pending.
            if (accept && await chatDb.isBlocked(client, team.host_id, me.id)) throw cantInvite();
            if (accept && (await teamDb.capacity(client, teamId)).approved >= TEAM_SIZE) throw teamFull();
            await teamDb.upsertMember(client, { teamId, userDbId: me.id, status: accept ? "approved" : "rejected" });
            return accept ? teamDb.memberIds(client, teamId, "approved") : [];
        });
        if (!accept) {
            // Only the host hears of a decline (no notification): their open Members / Invite dialogs refetch.
            await runAfter(async () => {
                const team = await teamDb.summary(teamId);
                if (team) await publishToUser(team.hostId, events.TEAM_UPDATED, { teamId, change: "declined", conversationId: team.conversationId, userId });
            });
            return { team: null, conversationId: null };
        }
        // Every approved member, not only the accepter: repairs a join an earlier chat failure lost (syncs are idempotent).
        const conversationId = await afterTeamChange({ teamId, change: "joined", joined: approvedIds, about: userId });
        const team = await teamDb.summary(teamId);
        return { team: team && { ...team, conversationId }, conversationId };
    },

    /** Rule 5: host only, never themselves; approved → kicked (out of the conversation), pending → kicked (invite withdrawn). */
    removeMember: async ({ userId, teamId, targetId }) => {
        parseOrThrow(removeSchema, { teamId, targetId });
        const wasApproved = await withTransaction(async (client) => {
            await lockForMember(client, teamId, userId, { hostOnly: true });
            if (targetId === userId) throw new ApiError("You can't remove yourself", 400);
            const [target] = await teamDb.people(client, { teamId, friendOfDbId: null, publicIds: [targetId] });
            if (target?.member_status !== "approved" && target?.member_status !== "pending") throw new ApiError("Member not found", 404);
            await teamDb.upsertMember(client, { teamId, userDbId: target.id, status: "kicked" });
            if (target.member_status !== "approved") return false;
            // Out of the conversation in this transaction (team, then conversation lock); the post-commit sync only fires the event.
            const conversation = await chatDb.lockByTeamId(client, teamId);
            if (conversation) await chatDb.leaveTeam(client, { conversationDbId: conversation.id, userDbId: target.id });
            return true;
        });
        await afterTeamChange({ teamId, change: "kicked", target: targetId, left: wasApproved ? [targetId] : [], about: targetId });
        return { team: await teamDb.summary(teamId) };
    },

    /** Rule 6: host only, same name rules as create. */
    rename: async ({ userId, teamId, name }) => {
        const input = parseOrThrow(renameSchema, { teamId, name });
        await withTransaction(async (client) => {
            await lockForMember(client, teamId, userId, { hostOnly: true });
            await teamDb.rename(client, teamId, input.name);
        });
        await afterTeamChange({ teamId, change: "renamed", about: userId });
        return { team: await teamDb.summary(teamId) };
    },

    /**
     * Rule 7: an approved member → left (joined_at kept). A leaving host hands over to the earliest-joined member;
     * with nobody approved left the team is deleted, its conversation and pending invites with it.
     */
    leave: async ({ userId, teamId }) => {
        parseOrThrow(teamIdSchema, teamId);
        const result = await withTransaction(async (client) => {
            const { team, me } = await lockForMember(client, teamId, userId);
            await teamDb.upsertMember(client, { teamId, userDbId: me.id, status: "left" });
            const next = await teamDb.nextHost(client, teamId);
            const conversation = await chatDb.lockByTeamId(client, teamId);
            if (!next) {
                // Read before the cascade removes them: the people whose invite ends with the team, and the stored files
                // (the conversation is locked, so no upload slips in between this read and the delete).
                const pendingIds = await teamDb.memberIds(client, teamId, "pending");
                const files = conversation ? await teamDb.conversationFiles(client, conversation.id) : [];
                await teamDb.deleteTeam(client, teamId);
                return { ended: true, pendingIds, chatId: conversation?.public_id ?? null, files };
            }
            if (conversation) await chatDb.leaveTeam(client, { conversationDbId: conversation.id, userDbId: me.id });
            if (team.host_id !== me.id) return { ended: false };
            await teamDb.setHost(client, teamId, next.user_id);
            return { ended: false, newHost: next, teamName: team.name, actor: me.username };
        });
        const { files = [], ...rest } = result;
        // The cascade dropped the rows, the only path to these files: the chat job deletes them from storage.
        if (files.length) await runAfter(() => queueAttachmentDelete(files));
        await afterTeamChange({ teamId, change: result.ended ? "ended" : "left", left: [userId], about: userId, ...rest });
        return { team: null };
    },
};

export default teamService;
