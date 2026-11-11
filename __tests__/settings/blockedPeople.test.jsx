// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

let blocked = [];
const unblock = vi.fn();
const showAlert = vi.fn();

vi.mock("@/clients/chat.client", () => ({ chatClient: { getBlocks: async () => ({ items: blocked }) } }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));
// The real hook invalidates the blocks query on success; the mock does the same after "the server" removes the row.
vi.mock("@/mutations/chat.mutation", async () => {
    const { chatKeys } = await import("@/keys/chat.keys");
    return {
        useUnblockUser: () => {
            const qc = useQueryClient();
            return {
                isPending: false,
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

    it("shows the empty state", async () => {
        blocked = [];
        renderIt();
        expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
    });
});
