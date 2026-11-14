import { ulid } from "ulid";
import { z } from "zod";
import { chatDb } from "@/db/chat.db";
import { teamDb } from "@/db/team.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { runAfter } from "@/lib/runAfter";
import { createTeamSchema, inviteSchema, teamIdSchema, teamNameSchema } from "@/lib/validation/team";
import { parseOrThrow } from "@/lib/validation/premium";
import { chatService } from "@/services/chat.service";

const TEAM_SIZE = 5;

const teamNotFound = () => new ApiError("Team not found", 404);
const userNotFound = () => new ApiError("User not found", 404);
const cantInvite = () => new ApiError("Can't invite this person", 403);
const teamFull = () => new ApiError("This team is full", 409);

const respondSchema = z.object({ teamId: teamIdSchema, accept: z.boolean() });
const removeSchema = z.object({ teamId: teamIdSchema, targetId: z.string().min(1, "Invalid user id").max(64, "Invalid user id") });
const renameSchema = z.object({ teamId: teamIdSchema, name: teamNameSchema });

/**
 * The single post-commit seam (rule 10). `changes`: `{ teamId, change, userId?, joined?, left?, ended?, ... }`: `userId` is
 * the person an accept is about; `joined` / `left` are public ids whose team conversation membership is synced (to their
 * committed team status); once `ended` the conversation is gone, so `left` is not synced.
 * Joining is awaited here, not deferred, so the caller gets the conversation id (the UI opens the team chat from it);
 * a failure of either call is logged, the committed change stays, and the id is null even if the conversation exists
 * (accept re-ensures it and re-syncs every approved member, rule 4).
 * Everything else goes through runAfter. Task 3 adds notifications and `team-updated` here from the same object
 * (`invited` rows, `hostChanged`, `pendingIds`). Returns the conversation id, or null when nobody joined or the chat failed.
 */
async function afterTeamChange({ teamId, joined = [], left = [], ended = false }) {
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

const dedupe = (list) => [...new Set(list)];

export const teamService = {
    /** Rule 1: the caller hosts a new team of 5 seats with 1–4 friends invited; one invalid invitee fails it all. */
    create: async ({ userId, name, memberIds }) => {
        const input = parseOrThrow(createTeamSchema, { name, memberIds });
        const ids = dedupe(input.memberIds);
        const teamId = `team_${ulid().toLowerCase()}`;
        const invited = await withTransaction(async (client) => {
            const [me] = await teamDb.people(client, { teamId: null, friendOfDbId: null, publicIds: [userId] });
            if (!me) throw userNotFound();
            const people = await teamDb.people(client, { teamId: null, friendOfDbId: me.id, publicIds: ids });
            await checkInvitees(client, me.id, people, ids);
            await teamDb.insertTeam(client, { id: teamId, name: input.name, hostDbId: me.id });
            await teamDb.upsertMember(client, { teamId, userDbId: me.id, status: "approved" });
            return invitePending(client, teamId, people);
        });
        const conversationId = await afterTeamChange({ teamId, change: "created", joined: [userId], invited });
        const team = await teamDb.summary(teamId);
        return { team: team && { ...team, conversationId } };
    },

    /** Rule 2: host only; approved / pending people are skipped; approved + pending stays ≤ 5. */
    invite: async ({ userId, teamId, userIds }) => {
        const input = parseOrThrow(inviteSchema, { teamId, userIds });
        const ids = dedupe(input.userIds);
        const invited = await withTransaction(async (client) => {
            const { me } = await lockForMember(client, teamId, userId, { hostOnly: true });
            const people = await teamDb.people(client, { teamId, friendOfDbId: me.id, publicIds: ids });
            const fresh = people.filter((p) => p.member_status !== "approved" && p.member_status !== "pending");
            if (people.length !== ids.length) throw userNotFound();
            const { approved, pending } = await teamDb.capacity(client, teamId);
            if (approved + pending + fresh.length > TEAM_SIZE) throw teamFull();
            await checkInvitees(client, me.id, fresh, fresh.map((p) => p.public_id));
            return invitePending(client, teamId, fresh);
        });
        if (invited.length) await afterTeamChange({ teamId, change: "invited", invited });
        return { team: await teamDb.summary(teamId) };
    },

    /** Rule 4: the invitee of a pending row; accept → approved and into the team conversation, decline → rejected. */
    respond: async ({ userId, teamId, accept }) => {
        parseOrThrow(respondSchema, { teamId, accept });
        const approvedIds = await withTransaction(async (client) => {
            if (!await teamDb.lockTeam(client, teamId)) throw teamNotFound();
            const [me] = await teamDb.people(client, { teamId, friendOfDbId: null, publicIds: [userId] });
            if (!me?.member_status) throw teamNotFound();
            if (me.member_status !== "pending") throw new ApiError("This invitation is no longer pending", 409);
            if (accept && (await teamDb.capacity(client, teamId)).approved >= TEAM_SIZE) throw teamFull();
            await teamDb.upsertMember(client, { teamId, userDbId: me.id, status: accept ? "approved" : "rejected" });
            return accept ? teamDb.memberIds(client, teamId, "approved") : [];
        });
        if (!accept) {
            await afterTeamChange({ teamId, change: "declined" });
            return { team: null, conversationId: null };
        }
        // Every approved member, not only the accepter: repairs a join an earlier chat failure lost (syncs are idempotent).
        const conversationId = await afterTeamChange({ teamId, change: "joined", userId, joined: approvedIds });
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
            return target.member_status === "approved";
        });
        await afterTeamChange({ teamId, change: "kicked", target: targetId, left: wasApproved ? [targetId] : [] });
        return { team: await teamDb.summary(teamId) };
    },

    /** Rule 6: host only, same name rules as create. */
    rename: async ({ userId, teamId, name }) => {
        const input = parseOrThrow(renameSchema, { teamId, name });
        await withTransaction(async (client) => {
            await lockForMember(client, teamId, userId, { hostOnly: true });
            await teamDb.rename(client, teamId, input.name);
        });
        await afterTeamChange({ teamId, change: "renamed" });
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
            if (!next) {
                // Read before the cascade removes them: the people whose invite ends with the team.
                const pendingIds = await teamDb.memberIds(client, teamId, "pending");
                await teamDb.deleteTeam(client, teamId);
                return { ended: true, pendingIds };
            }
            if (team.host_id !== me.id) return { ended: false };
            await teamDb.setHost(client, teamId, next);
            return { ended: false, hostChanged: true };
        });
        await afterTeamChange({ teamId, change: result.ended ? "ended" : "left", left: [userId], ...result });
        return { team: null };
    },
};

export default teamService;
