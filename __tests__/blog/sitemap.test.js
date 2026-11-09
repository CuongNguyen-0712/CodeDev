import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listSitemap = vi.fn();
vi.mock("@/services/blog.service", () => ({ blogService: { listSitemap: (...a) => listSitemap(...a) } }));
vi.mock("@/lib/cachedData", () => ({ getPrerenderedCourseIds: async () => ["crs_1"] }));

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const saved = process.env.NEXTAUTH_URL;
beforeEach(() => { process.env.NEXTAUTH_URL = "https://codedev.example/some/path"; });
afterEach(() => { if (saved === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = saved; });

describe("sitemap", () => {
    it("lists absolute urls with posts and courses", async () => {
        const updatedAt = new Date("2026-02-03T00:00:00Z");
        listSitemap.mockResolvedValue([{ slug: "hello-abc", updatedAt }]);
        const out = await sitemap();
        expect(out.every((e) => e.url.startsWith("https://codedev.example/"))).toBe(true);
        expect(out.find((e) => e.url === "https://codedev.example/blog/hello-abc").lastModified).toBe(updatedAt);
        expect(out.some((e) => e.url === "https://codedev.example/course/crs_1")).toBe(true);
        expect(out.some((e) => e.url === "https://codedev.example/blog")).toBe(true);
    });

    it("keeps static and course entries when the post read fails", async () => {
        listSitemap.mockRejectedValue(new Error("db down"));
        const out = await sitemap();
        expect(out.some((e) => e.url === "https://codedev.example/about")).toBe(true);
        expect(out.some((e) => e.url === "https://codedev.example/course/crs_1")).toBe(true);
        expect(out.some((e) => e.url.includes("/blog/"))).toBe(false);
    });
});

describe("robots", () => {
    it("disallows private areas and points at the sitemap", () => {
        const r = robots();
        expect(r.rules.disallow).toContain("/blog/new");
        expect(r.sitemap).toBe("https://codedev.example/sitemap.xml");
    });
});
