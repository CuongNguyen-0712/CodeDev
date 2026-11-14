// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Teams in /messages: New team dialog and the team conversation menu (spec section 7). */
const push = vi.fn();
const replace = vi.fn();
let friends;
let members;
let detail;
const userApi = vi.hoisted(() => ({ getFriends: vi.fn(), getTeamMembers: vi.fn() }));
const team = vi.hoisted(() => ({
    createTeamAction: vi.fn(), inviteToTeamAction: vi.fn(), respondTeamInviteAction: vi.fn(),
    removeTeamMemberAction: vi.fn(), renameTeamAction: vi.fn(), leaveTeamAction: vi.fn(),
}));

vi.mock("@/clients/user.client", () => ({ userClient: userApi }));
vi.mock("@/actions/team.actions", () => team);
vi.mock("@/lib/actionResult", () => ({ callAction: (run) => run() }));
vi.mock("@/clients/chat.client", () => ({
    chatClient: {
        getInbox: async () => ({ items: [], nextCursor: null }),
        getUnread: async () => ({ unread: 0, requests: 0 }),
        getConversation: async () => detail,
        getMessages: async () => ({ items: [], nextCursor: null }),
    },
}));
vi.mock("@/actions/chat.actions", () => ({
    ...Object.fromEntries(["blockUserAction", "createChatUploadAction", "editMessageAction", "recallMessageAction",
        "reportMessageAction", "respondRequestAction", "unblockUserAction", "sendMessageAction"].map((name) => [name, vi.fn()])),
    markReadAction: vi.fn(async () => ({})),
    typingAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null, isPusherConnected: () => true }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "P1" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

const { default: Inbox } = await import("@/components/chat/inbox");
const { default: ConversationView } = await import("@/components/chat/conversationView");

const person = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, level: 1, levelTitle: "Newbie", ...over });
const role = (id, r, over) => ({ ...person(id, over), role: r });
const chatMember = (id) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0" });

const renderWith = (ui) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

const openMenu = async () => {
    fireEvent.pointerDown(await screen.findByRole("button", { name: "More actions for Squad" }), { button: 0, ctrlKey: false });
    return screen.findByRole("menu");
};
const choose = async (name) => fireEvent.click(within(await openMenu()).getByRole("menuitem", { name }));

beforeEach(() => {
    window.ResizeObserver ??= class { observe() { } unobserve() { } disconnect() { } };
    vi.clearAllMocks();
    friends = { items: ["F1", "F2", "F3", "F4", "F5"].map((id) => person(id)), nextCursor: null };
    members = { team: { id: "team_x", name: "Squad" }, items: [role("P1", "host"), role("P2", "member"), role("P3", "invited")] };
    detail = { id: "cnv_t", kind: "team", teamId: "team_x", title: "Squad", image: null, state: "accepted", canSend: true, members: [chatMember("P1"), chatMember("P2")] };
    userApi.getFriends.mockImplementation(async () => friends);
    userApi.getTeamMembers.mockImplementation(async () => members);
});
afterEach(cleanup);

describe("New team", () => {
    const openDialog = async () => {
        renderWith(<Inbox />);
        fireEvent.click(screen.getByRole("button", { name: "New team" }));
        return screen.findByRole("dialog", { name: "New team" });
    };

    it("New team: name counter at 20, at most 4 friends selectable, Create disabled until valid", async () => {
        const dialog = await openDialog();
        const create = within(dialog).getByRole("button", { name: "Create" });
        const name = within(dialog).getByLabelText("Team name");
        expect(name.getAttribute("maxLength")).toBe("20");
        expect(within(dialog).getByText("0/20")).toBeTruthy();
        expect(create.disabled).toBe(true);

        fireEvent.change(name, { target: { value: "a".repeat(20) } });
        expect(within(dialog).getByText("20/20")).toBeTruthy();
        expect(create.disabled).toBe(true);   // no friend yet

        const boxes = await within(dialog).findAllByRole("checkbox");
        expect(boxes).toHaveLength(5);
        for (const box of boxes.slice(0, 4)) fireEvent.click(box);
        expect(within(dialog).getByText("4/4 selected")).toBeTruthy();
        expect(boxes[4].disabled).toBe(true);
        expect(boxes[0].disabled).toBe(false);
        expect(create.disabled).toBe(false);

        fireEvent.change(name, { target: { value: "   " } });
        expect(create.disabled).toBe(true);
    });

    it("after create it opens the team conversation", async () => {
        team.createTeamAction.mockResolvedValue({ team: { id: "team_x", name: "Squad", conversationId: "cnv_t" } });
        const dialog = await openDialog();
        fireEvent.change(within(dialog).getByLabelText("Team name"), { target: { value: " Squad " } });
        fireEvent.click(await within(dialog).findByRole("checkbox", { name: /f2/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/messages/cnv_t"));
        expect(team.createTeamAction).toHaveBeenCalledWith({ name: "Squad", memberIds: ["F2"] });
    });
});

describe("Team conversation menu", () => {
    it("team menu shows Invite / Rename / Remove for the host and only Members / Leave for a member", async () => {
        const first = renderWith(<ConversationView conversationId="cnv_t" />);
        const menu = await openMenu();
        await within(menu).findByRole("menuitem", { name: "Invite friends" });
        expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent))
            .toEqual(["Members (2/5)", "Invite friends", "Rename team", "Leave team"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Members (2/5)" }));
        const dialog = await screen.findByRole("dialog", { name: "Members (2/5)" });
        expect(within(dialog).getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
        first.unmount();

        members = { team: { id: "team_x", name: "Squad" }, items: [role("P2", "host"), role("P1", "member")] };
        renderWith(<ConversationView conversationId="cnv_t" />);
        await waitFor(() => expect(userApi.getTeamMembers).toHaveBeenCalledTimes(2));
        const memberMenu = await openMenu();
        await waitFor(() => expect(within(memberMenu).getAllByRole("menuitem").map((item) => item.textContent))
            .toEqual(["Members (2/5)", "Leave team"]));
        fireEvent.click(within(memberMenu).getByRole("menuitem", { name: "Members (2/5)" }));
        const memberDialog = await screen.findByRole("dialog", { name: "Members (2/5)" });
        await within(memberDialog).findByText("p2");
        expect(within(memberDialog).queryByRole("button", { name: /^Remove / })).toBeNull();
    });

    it("Members lists Host, members and Invited (host only), Remove asks for confirmation", async () => {
        team.removeTeamMemberAction.mockResolvedValue({ team: {} });
        renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Members (2/5)");
        const dialog = await screen.findByRole("dialog", { name: "Members (2/5)" });
        const rows = await within(dialog).findAllByRole("listitem");
        expect(rows.map((row) => row.textContent)).toEqual([
            expect.stringContaining("Host"), expect.not.stringMatching(/Host|Invited/), expect.stringContaining("Invited"),
        ]);
        expect(within(rows[0]).queryByRole("button")).toBeNull();

        fireEvent.click(within(dialog).getByRole("button", { name: "Remove p2 from the team" }));
        const confirm = await screen.findByRole("alertdialog", { name: "Remove p2?" });
        expect(team.removeTeamMemberAction).not.toHaveBeenCalled();
        fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(team.removeTeamMemberAction).toHaveBeenCalledWith({ teamId: "team_x", userId: "P2" }));
    });

    it("Invite friends hides people already in the team or invited and stops at the free slots", async () => {
        team.inviteToTeamAction.mockResolvedValue({ team: {} });
        friends = { items: ["P2", "P3", "F1", "F2", "F3"].map((id) => person(id)), nextCursor: null };
        renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Invite friends");
        const dialog = await screen.findByRole("dialog", { name: "Invite friends" });
        const boxes = await within(dialog).findAllByRole("checkbox");
        expect(boxes.map((box) => box.closest("label").textContent)).toEqual([
            expect.stringContaining("f1"), expect.stringContaining("f2"), expect.stringContaining("f3"),
        ]);
        expect(within(dialog).getByText("2 free slots")).toBeTruthy();
        const invite = within(dialog).getByRole("button", { name: "Invite" });
        expect(invite.disabled).toBe(true);
        fireEvent.click(boxes[0]);
        fireEvent.click(boxes[1]);
        expect(boxes[2].disabled).toBe(true);
        fireEvent.click(invite);
        await waitFor(() => expect(team.inviteToTeamAction).toHaveBeenCalledWith({ teamId: "team_x", userIds: ["F1", "F2"] }));
    });

    it("Invite friends on a full team says so and cannot submit", async () => {
        members.items.push(role("P4", "member"), role("P5", "invited"));
        renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Invite friends");
        const dialog = await screen.findByRole("dialog", { name: "Invite friends" });
        expect(await within(dialog).findByText("The team is full")).toBeTruthy();
        expect(within(dialog).getByRole("button", { name: "Invite" }).disabled).toBe(true);
    });

    it("Rename submits the cleaned name only once it changed", async () => {
        team.renameTeamAction.mockResolvedValue({ team: {} });
        renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Rename team");
        const dialog = await screen.findByRole("dialog", { name: "Rename team" });
        const field = within(dialog).getByLabelText("Team name");
        const save = within(dialog).getByRole("button", { name: "Save" });
        expect(field.value).toBe("Squad");
        expect(save.disabled).toBe(true);
        fireEvent.change(field, { target: { value: "Night owls " } });
        expect(within(dialog).getByText("11/20")).toBeTruthy();
        fireEvent.click(save);
        await waitFor(() => expect(team.renameTeamAction).toHaveBeenCalledWith({ teamId: "team_x", name: "Night owls" }));
    });

    it("Leave as host names the next host; as the last member says the team will end", async () => {
        team.leaveTeamAction.mockResolvedValue({ team: null });
        members.items = [role("P1", "host"), role("P3", "invited"), role("P2", "member", { nickname: "Bea" })];
        const first = renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Leave team");
        let confirm = await screen.findByRole("alertdialog", { name: "Leave Squad?" });
        expect(confirm.textContent).toContain("p2 becomes the host.");
        fireEvent.click(within(confirm).getByRole("button", { name: "Leave" }));
        await waitFor(() => expect(team.leaveTeamAction).toHaveBeenCalledWith("team_x"));
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages"));
        first.unmount();

        members.items = [role("P1", "host"), role("P3", "invited")];
        const second = renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Leave team");
        confirm = await screen.findByRole("alertdialog", { name: "Leave Squad?" });
        await waitFor(() => expect(confirm.textContent).toContain("The team will end."));
        second.unmount();

        members.items = [role("P2", "host"), role("P1", "member")];
        renderWith(<ConversationView conversationId="cnv_t" />);
        await choose("Leave team");
        confirm = await screen.findByRole("alertdialog", { name: "Leave Squad?" });
        await waitFor(() => expect(confirm.textContent).toContain("You will stop receiving messages from this team."));
    });
});
