// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** /contact: Find people, Friends and Invitations tabs (spec section 7). */
const empty = { items: [], nextCursor: null };
let data;
const api = {
    getUsers: vi.fn(async () => data.users),
    getFriends: vi.fn(async () => data.friends),
    getFriendInvitations: vi.fn(async ({ direction }) => data[direction]),
    getFriendCounts: vi.fn(async () => data.counts),
};
let params;
const replaceState = vi.spyOn(window.history, "replaceState");

vi.mock("@/clients/user.client", () => ({ userClient: api }));
vi.mock("@/actions/social.actions", () => ({
    sendFriendRequestAction: vi.fn(), respondFriendRequestAction: vi.fn(), cancelFriendRequestAction: vi.fn(), removeFriendAction: vi.fn(),
}));
vi.mock("@/lib/actionResult", () => ({ callAction: (run) => run() }));
vi.mock("@/lib/pusherClient", () => ({ isPusherConnected: () => true }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "me" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => params, usePathname: () => "/contact" }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));

const actions = await import("@/actions/social.actions");
const { default: ContactPage } = await import("@/components/contact/contactPage");
const { default: FriendButton } = await import("@/components/contact/friendButton");

const person = (id, over = {}) => ({ id, username: id, nickname: null, image: null, level: 1, levelTitle: "Newbie", ...over });
const pageOf = (...items) => ({ items, nextCursor: null });

const renderWith = (ui) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

beforeEach(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    vi.clearAllMocks();
    params = new URLSearchParams();
    data = { users: empty, friends: empty, received: empty, sent: empty, counts: { friends: 0, received: 0 } };
});
afterEach(cleanup);

describe("ContactPage tabs", () => {
    it("?tab=invitations opens the Invitations tab; switching tabs updates the URL", async () => {
        params = new URLSearchParams("tab=invitations");
        renderWith(<ContactPage />);
        expect(screen.getByRole("tab", { name: /Invitations/ }).getAttribute("aria-selected")).toBe("true");
        await screen.findByRole("heading", { name: /Received/ });
        // Only the open tab fetches.
        expect(api.getUsers).not.toHaveBeenCalled();
        expect(api.getFriends).not.toHaveBeenCalled();

        fireEvent.mouseDown(screen.getByRole("tab", { name: /Friends/ }), { button: 0 });
        expect(replaceState).toHaveBeenCalledWith(null, "", "/contact?tab=friends");
    });

    it("an unknown ?tab= falls back to Find people", () => {
        params = new URLSearchParams("tab=nope");
        renderWith(<ContactPage />);
        expect(screen.getByRole("tab", { name: /Find people/ }).getAttribute("aria-selected")).toBe("true");
    });

    it("tab labels show counts: Friends 12, Invitations 2", async () => {
        data.counts = { friends: 12, received: 2 };
        renderWith(<ContactPage />);
        await screen.findByRole("tab", { name: /Friends\s*12/ });
        expect(screen.getByRole("tab", { name: /Invitations\s*2/ })).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Find people/ }).textContent).toBe("Find people");
    });

    it("hides a count of 0", async () => {
        data.counts = { friends: 0, received: 3 };
        renderWith(<ContactPage />);
        await screen.findByRole("tab", { name: /Invitations\s*3/ });
        expect(screen.getByRole("tab", { name: /Friends/ }).textContent).toBe("Friends");
    });
});

describe("FriendButton", () => {
    it("renders the right control for each friendship", () => {
        const amy = person("amy");
        const { rerender } = renderWith(<FriendButton user={amy} friendship={null} />);
        expect(screen.getByRole("button", { name: "Add friend amy" })).toBeTruthy();

        const wrap = (friendship) => (
            <QueryClientProvider client={new QueryClient()}><FriendButton user={amy} friendship={friendship} /></QueryClientProvider>
        );
        rerender(wrap("sent"));
        expect(screen.getByRole("button", { name: "Requested, cancel request to amy" }).textContent).toMatch(/Requested/);

        rerender(wrap("received"));
        expect(screen.getByRole("button", { name: "Accept friend request from amy" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Decline friend request from amy" })).toBeTruthy();

        rerender(wrap("friends"));
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("Add friend calls send with the person's id", async () => {
        actions.sendFriendRequestAction.mockResolvedValue({ friendship: "sent", user: person("amy") });
        renderWith(<FriendButton user={person("amy")} friendship={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Add friend amy" }));
        await waitFor(() => expect(actions.sendFriendRequestAction).toHaveBeenCalledWith("amy"));
    });

    it("Requested asks before cancelling", async () => {
        actions.cancelFriendRequestAction.mockResolvedValue({ friendship: null, user: person("amy") });
        renderWith(<FriendButton user={person("amy")} friendship="sent" />);
        fireEvent.click(screen.getByRole("button", { name: "Requested, cancel request to amy" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(actions.cancelFriendRequestAction).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel request" }));
        await waitFor(() => expect(actions.cancelFriendRequestAction).toHaveBeenCalledWith("amy"));
    });
});

describe("Find people", () => {
    it("shows the friend button for each row next to Message", async () => {
        data.users = pageOf({ ...person("bob"), friendship: "received", showProfile: true, rank: null }, { ...person("cat"), friendship: "friends", showProfile: true, rank: null });
        renderWith(<ContactPage />);
        await screen.findByRole("button", { name: "Accept friend request from bob" });
        expect(screen.getByRole("link", { name: "Message cat" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Add friend cat/ })).toBeNull();
    });

    it("empty state", async () => {
        renderWith(<ContactPage />);
        expect(await screen.findByText("No other learners yet")).toBeTruthy();
    });
});

describe("Friends tab", () => {
    beforeEach(() => { params = new URLSearchParams("tab=friends"); });

    it("lists friends with @username and Message", async () => {
        data.friends = pageOf(person("amy", { nickname: "Amy L" }), person("ben", { nickname: "None" }));
        renderWith(<ContactPage />);
        await screen.findByText("Amy L");
        expect(screen.getByText("@amy")).toBeTruthy();
        // 'None' is an unset nickname: the username stands in.
        expect(screen.getByText("ben")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Message Amy L" })).toBeTruthy();
    });

    it("Unfriend asks for confirmation before calling remove", async () => {
        data.friends = pageOf(person("amy"));
        actions.removeFriendAction.mockResolvedValue({ friendship: null, user: person("amy") });
        renderWith(<ContactPage />);
        const menu = await screen.findByRole("button", { name: "More actions for amy" });
        fireEvent.pointerDown(menu, { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: /Unfriend/ }));

        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Unfriend amy?")).toBeTruthy();
        expect(actions.removeFriendAction).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", { name: "Unfriend" }));
        await waitFor(() => expect(actions.removeFriendAction).toHaveBeenCalledWith("amy"));
    });

    it("empty state", async () => {
        renderWith(<ContactPage />);
        expect(await screen.findByText("No friends yet")).toBeTruthy();
    });
});

describe("Invitations tab", () => {
    beforeEach(() => { params = new URLSearchParams("tab=invitations"); });

    it("Invitations shows Received with Accept/Decline and Sent with Cancel", async () => {
        data.received = pageOf(person("bob"));
        data.sent = pageOf(person("cat"));
        actions.cancelFriendRequestAction.mockResolvedValue({ friendship: null, user: person("cat") });
        renderWith(<ContactPage />);

        const received = (await screen.findByRole("heading", { name: /Received/ })).closest("section");
        await within(received).findByRole("button", { name: "Accept friend request from bob" });
        expect(within(received).getByRole("button", { name: "Decline friend request from bob" })).toBeTruthy();

        const sent = screen.getByRole("heading", { name: /Sent/ }).closest("section");
        fireEvent.click(await within(sent).findByRole("button", { name: "Cancel friend request to cat" }));
        await waitFor(() => expect(actions.cancelFriendRequestAction).toHaveBeenCalledWith("cat"));
        expect(api.getFriendInvitations.mock.calls.map(([p]) => p.direction).sort()).toEqual(["received", "sent"]);
    });

    it("empty state for each section", async () => {
        renderWith(<ContactPage />);
        expect(await screen.findByText("No invitations")).toBeTruthy();
        expect(await screen.findByText("No pending requests")).toBeTruthy();
    });
});
