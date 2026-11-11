// @vitest-environment jsdom
// Admin chat reports row: each attached image shows as a thumbnail through the admin image route.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ULID = "0123456789abcdefghjkmnpqrs";
let items = [];

vi.mock("@/clients/premium.client", () => ({ adminClient: { listChatReports: async () => ({ items, nextCursor: null }) } }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/mutations/premium.mutation", () => ({ useAdminChatReportAction: () => ({ isPending: false, mutate: vi.fn() }) }));

const { default: ChatReports } = await import("@/components/admin/chat/chatReports");

const row = (attachments, body = "") => ({
    messageId: `msg_${ULID}`, body, conversationKind: "direct", reports: 1, reasons: ["Spam or abuse"],
    firstReportedAt: "2026-11-10T00:00:00.000Z", attachments, sender: { id: "u1", username: "ann", nickname: null },
});
const renderIt = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatReports />
    </QueryClientProvider>
);

afterEach(cleanup);

describe("ChatReports thumbnails", () => {
    it("renders one linked thumbnail per image, served by the admin route", async () => {
        const ids = [`att_${ULID}`, `att_${ULID.replace("0", "1")}`];
        items = [row(ids)];
        renderIt();
        const images = await screen.findAllByRole("img");
        expect(images).toHaveLength(2);
        ids.forEach((id, index) => {
            const src = `/api/admin/chat-reports/msg_${ULID}/attachments/${id}`;
            expect(images[index].getAttribute("src")).toBe(src);
            expect(images[index].getAttribute("alt")).toBe(`Image ${index + 1} of 2 from ann`);
            expect(images[index].getAttribute("loading")).toBe("lazy");
            const link = images[index].closest("a");
            expect(link.getAttribute("href")).toBe(src);
            expect(link.getAttribute("target")).toBe("_blank");
            expect(link.getAttribute("rel")).toBe("noopener noreferrer");
        });
        expect(screen.queryByText(/2 images/)).toBeNull();
    });

    it("a text-only report shows no thumbnails", async () => {
        items = [row([], "Just words")];
        renderIt();
        expect(await screen.findByText("Just words")).toBeTruthy();
        expect(screen.queryAllByRole("img")).toHaveLength(0);
    });
});
