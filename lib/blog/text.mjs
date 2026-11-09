import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { headingIdMaker, nodeText, slugBase, TOC_DEPTHS } from "./headings.mjs";
import { normalizeTag } from "./tags.mjs";

export const BLOG_LIMITS = { title: 150, excerpt: 300, body: 50000, tags: 5, images: 20, appealReason: 500 };

const parse = (md) => unified().use(remarkParse).use(remarkGfm).parse(md);

// Depth-first, document order.
function walk(node, visit) {
    visit(node);
    for (const child of node.children ?? []) walk(child, visit);
}

export function postSlug(title, publicId) {
    const base = slugBase(title).slice(0, 80).replace(/-+$/, "");
    return `${base || "post"}-${publicId.slice(-6)}`;
}

/** h2/h3 of a body for the table of contents, with the ids the rendered headings get. */
export function extractHeadings(md) {
    const nextId = headingIdMaker();
    const headings = [];
    walk(parse(md), (n) => {
        if (n.type !== "heading" || !TOC_DEPTHS.has(n.depth)) return;
        const text = nodeText(n).trim();
        headings.push({ depth: n.depth, id: nextId(text), text });
    });
    return headings;
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

export const normalizeTags = (tags) => [...new Set(tags.map(normalizeTag))];
