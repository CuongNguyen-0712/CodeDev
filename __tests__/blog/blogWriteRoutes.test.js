// Author write routes: a body at the 50,000-character limit must reach the service (no 413).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ requireAuthSession: vi.fn(async () => ({ user: { id: "usr_1" } })), getAuthSession: vi.fn() }));
vi.mock("@/lib/rateLimit", () => {
    const allow = { limitRequest: async () => ({ allowed: true, headers: {} }) };
    return { rateLimiters: { blogCreate: allow, blogWrite: allow } };
});
const create = vi.fn(async () => ({ id: "pst_x", slug: "x", status: "draft" }));
const update = vi.fn(async () => ({ id: "pst_x", slug: "x", status: "draft" }));
vi.mock("@/services/blog.service", () => ({ blogService: { create, update } }));

const { POST } = await import("@/app/api/blog/posts/route");
const { PATCH } = await import("@/app/api/blog/posts/[id]/route");

const POST_ID = `pst_${"0".repeat(26)}`;
const body = { title: "A long post", tags: ["js"], body: "ả".repeat(50000), submit: false };
const request = (url, method) => new Request(url, {
    method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "http://localhost" },
});

describe("blog write routes accept a full-size body", () => {
    beforeEach(() => { create.mockClear(); update.mockClear(); });

    it("POST /api/blog/posts", async () => {
        const res = await POST(request("http://localhost/api/blog/posts", "POST"));
        expect(res.status).toBe(201);
        expect(create.mock.calls[0][0].input.body).toHaveLength(50000);
    });

    it("PATCH /api/blog/posts/[id]", async () => {
        const res = await PATCH(request(`http://localhost/api/blog/posts/${POST_ID}`, "PATCH"), { params: Promise.resolve({ id: POST_ID }) });
        expect(res.status).toBe(200);
        expect(update.mock.calls[0][0].input.body).toHaveLength(50000);
    });
});
