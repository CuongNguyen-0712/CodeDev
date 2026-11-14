import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import { chatKeys } from "@/keys/chat.keys";
import { friendKeys } from "@/keys/friend.keys";
import { teamKeys } from "@/keys/team.keys";
import { createTeamHandler } from "@/lib/team/realtimeHandler";

const inbox = (...ids) => ({ pages: [{ items: ids.map((id) => ({ id })), nextCursor: null }], pageParams: [null] });
const rows = (tab) => qc.getQueryData(chatKeys.inbox(tab)).pages[0].items.map((r) => r.id);
const stale = (key) => qc.getQueryState(key).isInvalidated;

let qc;
beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(chatKeys.inbox("all"), inbox("cnv_team", "cnv_dm"));
    qc.setQueryData(chatKeys.inbox("requests"), inbox());
    qc.setQueryData(friendKeys.counts(), { friends: 1, received: 0, teamInvitations: 1 });
    qc.setQueryData(teamKeys.invitations(), { pages: [] });
});

describe("team-updated", () => {
    it("ended drops the team conversation from the inbox and invalidates teams, counts, inbox", () => {
        createTeamHandler(qc, "me")({ teamId: "t", change: "ended", conversationId: "cnv_team" });
        expect(rows("all")).toEqual(["cnv_dm"]);
        for (const key of [teamKeys.invitations(), friendKeys.counts(), chatKeys.inbox("all")]) expect(stale(key)).toBe(true);
    });

    it("kicked / left drop the row only when the event is about me", () => {
        createTeamHandler(qc, "me")({ teamId: "t", change: "kicked", conversationId: "cnv_team", userId: "other" });
        expect(rows("all")).toEqual(["cnv_team", "cnv_dm"]);
        createTeamHandler(qc, "me")({ teamId: "t", change: "left", conversationId: "cnv_team", userId: "me" });
        expect(rows("all")).toEqual(["cnv_dm"]);
    });

    it("without a conversation id the inbox is only invalidated", () => {
        createTeamHandler(qc, "me")({ teamId: "t", change: "ended" });
        expect(rows("all")).toEqual(["cnv_team", "cnv_dm"]);
        expect(stale(chatKeys.inbox("all"))).toBe(true);
    });

    it("other changes never touch rows", () => {
        createTeamHandler(qc, "me")({ teamId: "t", change: "renamed", conversationId: "cnv_team" });
        expect(rows("all")).toEqual(["cnv_team", "cnv_dm"]);
        expect(stale(friendKeys.counts())).toBe(true);
    });
});
