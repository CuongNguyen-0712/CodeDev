import { describe, expect, it } from "vitest";

import { extractImageUrls, makeExcerpt, normalizeTags, postSlug, readingMinutes } from "@/lib/blog/text.mjs";

const id = "pst_01hjabcdefghjkmnpqrstvwxyz";

describe("postSlug", () => {
    it("strips diacritics and maps đ", () => expect(postSlug("Học React từ đầu", id)).toBe("hoc-react-tu-dau-tvwxyz"));
    it("falls back to post", () => expect(postSlug("🔥🔥", id)).toMatch(/^post-[a-z0-9]{6}$/));
    it("caps the title part at 80 characters", () => expect(postSlug("a".repeat(300), id).length).toBeLessThanOrEqual(87));
});

describe("extractImageUrls", () => {
    it("ignores code and dedupes", () => {
        const md = "![a](https://res.cloudinary.com/x.png)\n```\n![b](https://evil.example/b.png)\n```\n`![c](https://evil.example/c.png)`\n~~~\n![d](https://evil.example/d.png)\n~~~\n![a](https://res.cloudinary.com/x.png \"t\")";
        expect(extractImageUrls(md)).toEqual(["https://res.cloudinary.com/x.png"]);
    });
});

describe("extractImageUrls (rendered images only)", () => {
    const u = "https://evil.example/a.png";
    const BT = "`";
    it.each([
        ["escaped backticks", `\${BT}![x](${u})\${BT}`],
        ["single-quote title", `![x](${u} 'T')`],
        ["paren title", `![x](${u} (T))`],
        ["nested brackets in alt", `![a [b]](${u})`],
        ["fake fence with backtick info", `${BT.repeat(3)} ${BT}
![x](${u})`],
        ["reference image", `![x][R]

[r]: ${u}`],
    ])("finds %s", (_, md) => expect(extractImageUrls(md)).toEqual([u]));

    it("skips an indented code block", () => expect(extractImageUrls(`text

    ![x](${u})
`)).toEqual([]));
    it("does not close a fence on an info-string line", () => {
        expect(extractImageUrls(`${BT.repeat(3)}
${BT.repeat(3)}js
![x](${u})
${BT.repeat(3)}
`)).toEqual([]);
    });
});

describe("makeExcerpt", () => {
    it("keeps # and _ in prose", () => {
        const out = makeExcerpt("C# tips for snake_case");
        expect(out).toContain("C# tips");
        expect(out).toContain("snake_case");
    });
    it("keeps only prose", () => {
        const md = "# Title\n\nHello **world** with [a link](http://x.y).\n\n```js\nconst secret = 1;\n```\n\n![img](http://i.png)";
        expect(makeExcerpt(md)).toBe("Title Hello world with a link.");
    });
    it("cuts at a word boundary", () => {
        const out = makeExcerpt("word ".repeat(200));
        expect(out.length).toBeLessThanOrEqual(300);
        expect(out.endsWith("word…")).toBe(true);
    });
});

describe("readingMinutes", () => {
    it("is at least 1", () => expect(readingMinutes("")).toBe(1));
    it("rounds up", () => expect(readingMinutes("w ".repeat(401))).toBe(3));
});

describe("normalizeTags", () => {
    it("trims, lowercases, hyphenates, dedupes", () => expect(normalizeTags([" Next JS ", "nextjs", "next-js"])).toEqual(["next-js", "nextjs"]));
});
