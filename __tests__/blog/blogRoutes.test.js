// Public blog list route: input errors are 400 before any session or DB work; the 200 case needs PostgreSQL.
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/blog/posts/route";

const call = (qs) => GET(new Request(`http://localhost/api/blog/posts${qs}`));

describe("GET /api/blog/posts", () => {
    it("rejects a malformed tag", async () => {
        expect((await call("?tag=Bad%20Tag!")).status).toBe(400);
    });

    it("rejects a malformed cursor", async () => {
        expect((await call("?cursor=not-a-cursor")).status).toBe(400);
    });

    it.skipIf(!process.env.DATABASE_URL)("returns a page that is never cached", async () => {
        const res = await call("");
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.items)).toBe(true);
        expect(body.data).toHaveProperty("nextCursor");
    });
});
