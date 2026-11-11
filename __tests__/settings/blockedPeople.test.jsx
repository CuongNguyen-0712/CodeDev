// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

let blocked = [];
const unblock = vi.fn();
const showAlert = vi.fn();
let pending = false;

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "me" } }, status: "authenticated" }) }));

vi.mock("@/clients/chat.client", () => ({ chatClient: { getBlocks: async () => ({ items: blocked }) } }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));
// The real hook invalidates the blocks query on success; the mock does the same after "the server" removes the row.
vi.mock("@/mutations/chat.mutation", async () => {
    const { chatKeys } = await import("@/keys/chat.keys");
    return {
        useUnblockUser: () => {
            const qc = useQueryClient();
            return {
                isPending: pending,
                mutate: (id, opts) => {
                    unblock(id);
                    blocked = blocked.filter((b) => b.id !== id);
                    qc.invalidateQueries({ queryKey: chatKeys.blocks() });
                    opts?.onSuccess?.();
                },
            };
        },
    };
});

const { default: BlockedPeopleSection } = await import("@/components/settings/blockedPeopleSection");

const renderIt = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BlockedPeopleSection />
    </QueryClientProvider>
);

beforeEach(() => {
    vi.clearAllMocks();
    pending = false;
    blocked = [
        { id: "u1", username: "ann", nickname: "Annie", image: null, blockedAt: "2026-11-01T00:00:00Z" },
        { id: "u2", username: "bob", nickname: null, image: null, blockedAt: "2026-11-02T00:00:00Z" },
    ];
});
afterEach(cleanup);

describe("BlockedPeopleSection", () => {
    it("lists the blocked people", async () => {
        renderIt();
        expect(await screen.findByText("ann")).toBeTruthy();
        expect(screen.getByText("bob")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Unblock ann" })).toBeTruthy();
    });

    it("Unblock calls the mutation and removes the row", async () => {
        renderIt();
        fireEvent.click(await screen.findByRole("button", { name: "Unblock ann" }));
        expect(unblock).toHaveBeenCalledWith("u1");
        await waitFor(() => expect(screen.queryByText("ann")).toBeNull());
        expect(screen.getByText("bob")).toBeTruthy();
    });

    it("disables every Unblock button while one unblock is pending", async () => {
        pending = true;
        renderIt();
        await screen.findByText("ann");
        expect(screen.getByRole("button", { name: "Unblock ann" }).disabled).toBe(true);
        expect(screen.getByRole("button", { name: "Unblock bob" }).disabled).toBe(true);
    });

    it("shows the empty state", async () => {
        blocked = [];
        renderIt();
        expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
    });
});
