// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** /contact Invitations tab: the Teams section and the tab count (spec section 7). */
const empty = { items: [], nextCursor: null };
let data;
const showAlert = vi.hoisted(() => vi.fn());
const api = {
    getUsers: vi.fn(async () => empty),
    getFriends: vi.fn(async () => empty),
    getFriendInvitations: vi.fn(async () => empty),
    getFriendCounts: vi.fn(async () => data.counts),
    getTeamInvitations: vi.fn(async () => data.teams),
};
const team = vi.hoisted(() => ({
    createTeamAction: vi.fn(), inviteToTeamAction: vi.fn(), respondTeamInviteAction: vi.fn(),
    removeTeamMemberAction: vi.fn(), renameTeamAction: vi.fn(), leaveTeamAction: vi.fn(),
}));

vi.mock("@/clients/user.client", () => ({ userClient: api }));
vi.mock("@/actions/team.actions", () => team);
vi.mock("@/actions/social.actions", () => ({
    sendFriendRequestAction: vi.fn(), respondFriendRequestAction: vi.fn(), cancelFriendRequestAction: vi.fn(), removeFriendAction: vi.fn(),
}));
vi.mock("@/lib/actionResult", () => ({ callAction: (run) => run() }));
vi.mock("@/lib/pusherClient", () => ({ isPusherConnected: () => true }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "me" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=invitations"), usePathname: () => "/contact" }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));

const { default: ContactPage } = await import("@/components/contact/contactPage");

const invite = { team: { id: "team_a", name: "Study group" }, invitedBy: { id: "amy", username: "amy", nickname: null, image: null, level: 1, levelTitle: "Newbie" }, invitedAt: "2026-11-14T00:00:00Z" };

const renderPage = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ContactPage /></QueryClientProvider>
);

beforeEach(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    vi.clearAllMocks();
    data = { teams: { items: [invite], nextCursor: null }, counts: { friends: 0, received: 2, teamInvitations: 1 } };
});
afterEach(cleanup);

describe("Invitations Teams section", () => {
    it("Invitations shows a Teams section with team name, inviter, Accept and Decline", async () => {
        renderPage();
        await screen.findByRole("heading", { name: "Teams" });
        expect(await screen.findByText("Study group")).toBeTruthy();
        expect(screen.getByText("Invited by amy")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Accept invitation to Study group" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Decline invitation to Study group" })).toBeTruthy();
    });

    it("Accept calls respond({ teamId, accept: true }) and the tab count drops", async () => {
        team.respondTeamInviteAction.mockImplementation(async () => {
            data.teams = empty;
            data.counts = { friends: 0, received: 2, teamInvitations: 0 };
            return { team: invite.team, conversationId: "c1" };
        });
        renderPage();
        await screen.findByRole("tab", { name: /Invitations\s*3/ });
        fireEvent.click(await screen.findByRole("button", { name: "Accept invitation to Study group" }));
        await waitFor(() => expect(team.respondTeamInviteAction).toHaveBeenCalledWith({ teamId: "team_a", accept: true }));
        await screen.findByRole("tab", { name: /Invitations\s*2/ });
        expect(showAlert).toHaveBeenCalledWith(200, "You joined Study group");
        await screen.findByText("No team invitations");
    });

    it("the Invitations tab counts friend requests plus team invitations", async () => {
        renderPage();
        await screen.findByRole("tab", { name: /Invitations\s*3/ });
    });
});
