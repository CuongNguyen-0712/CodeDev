import { describe, expect, it } from "vitest";
import { blogPostingJsonLd } from "@/lib/blog/jsonLd.mjs";

describe("blogPostingJsonLd", () => {
    it("escapes < so user text cannot close the script tag", () => {
        const out = blogPostingJsonLd({
            title: "</script><script>alert(1)</script>",
            excerpt: "<b>x</b>",
            slug: "s",
            publishedAt: "2026-01-01T00:00:00Z",
            author: { id: "usr_1", username: "ann" },
        }, "https://codedev.example");
        expect(out).not.toContain("<");
        expect(out).toContain("\\u003c");
        expect(JSON.parse(out).headline).toBe("</script><script>alert(1)</script>");
    });

    it("emits absolute author and page urls", () => {
        const ld = JSON.parse(blogPostingJsonLd({
            title: "t", excerpt: "e", slug: "s", publishedAt: "2026-01-01T00:00:00Z", author: { id: "usr_1", username: "ann" },
        }, "https://codedev.example"));
        expect(ld.author.url).toBe("https://codedev.example/profile/usr_1");
        expect(ld.mainEntityOfPage).toBe("https://codedev.example/blog/s");
    });
});
