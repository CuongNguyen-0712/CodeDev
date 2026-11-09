import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export const BLOG_LIMITS = { title: 150, excerpt: 300, body: 50000, tags: 5, images: 20, appealReason: 500 };

const parse = (md) => unified().use(remarkParse).use(remarkGfm).parse(md);

// Depth-first, document order.
function walk(node, visit) {
    visit(node);
    for (const child of node.children ?? []) walk(child, visit);
}

export function postSlug(title, publicId) {
    const base = String(title)
        .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 80).replace(/-+$/, "");
    return `${base || "post"}-${publicId.slice(-6)}`;
}

export function extractImageUrls(md) {
    const tree = parse(md);
    const defs = new Map();
    walk(tree, (n) => { if (n.type === "definition" && !defs.has(n.identifier)) defs.set(n.identifier, n.url); });
    const urls = [];
    walk(tree, (n) => {
        if (n.type === "image") urls.push(n.url);
        else if (n.type === "imageReference" && defs.has(n.identifier)) urls.push(defs.get(n.identifier));
    });
    return [...new Set(urls)];
}

const BREAKS = new Set(["paragraph", "heading", "listItem", "tableCell", "blockquote", "break", "thematicBreak"]);
const SKIPPED = new Set(["code", "image", "html", "definition"]);

export function makeExcerpt(md, max = BLOG_LIMITS.excerpt) {
    let raw = "";
    const collect = (n) => {
        if (SKIPPED.has(n.type)) return;
        if (n.type === "text" || n.type === "inlineCode") raw += n.value;
        for (const child of n.children ?? []) collect(child);
        if (BREAKS.has(n.type)) raw += " ";
    };
    collect(parse(md));
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const readingMinutes = (md) => Math.max(1, Math.ceil(md.split(/\s+/).filter(Boolean).length / 200));

export const normalizeTags = (tags) => [...new Set(tags.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-")))];
