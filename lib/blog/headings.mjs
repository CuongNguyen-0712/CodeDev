// Heading ids shared by the server table of contents (mdast) and the rendered body (hast).
// Plain ESM with no parser import, so the browser editor preview can use it too.

export const slugBase = (text) => String(text)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Text of an mdast or hast node: both keep leaf text in `value`.
export const nodeText = (node) => node.value ?? (node.children ?? []).map(nodeText).join("");

export const TOC_DEPTHS = new Set([2, 3]);

// Both trees list headings in document order, so the same sequence of texts yields the same ids.
export function headingIdMaker() {
    const seen = new Map();
    return (text) => {
        const base = slugBase(text) || "section";
        const count = seen.get(base) || 0;
        seen.set(base, count + 1);
        return count ? `${base}-${count}` : base;
    };
}

// rehype plugin: ids on h2/h3 (pure per render, unlike a counter inside a React component).
export const rehypeHeadingIds = () => (tree) => {
    const nextId = headingIdMaker();
    const visit = (node) => {
        if (node.type === "element" && /^h[23]$/.test(node.tagName)) {
            node.properties = { ...node.properties, id: nextId(nodeText(node)) };
        }
        for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
};
