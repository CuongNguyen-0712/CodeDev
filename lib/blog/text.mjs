export const BLOG_LIMITS = { title: 150, excerpt: 300, body: 50000, tags: 5, images: 20, appealReason: 500 };

// An unclosed fence runs to the end of the text, as in CommonMark.
const FENCE = /^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const noCode = (md) => md.replace(FENCE, "").replace(INLINE_CODE, "");

export function postSlug(title, publicId) {
    const base = String(title)
        .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 80).replace(/-+$/, "");
    return `${base || "post"}-${publicId.slice(-6)}`;
}

export function extractImageUrls(md) {
    const urls = [...noCode(md).matchAll(/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]);
    return [...new Set(urls)];
}

export function makeExcerpt(md, max = BLOG_LIMITS.excerpt) {
    const text = noCode(md)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
        .replace(/[*_~#>`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const readingMinutes = (md) => Math.max(1, Math.ceil(md.split(/\s+/).filter(Boolean).length / 200));

export const normalizeTags = (tags) => [...new Set(tags.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-")))];
