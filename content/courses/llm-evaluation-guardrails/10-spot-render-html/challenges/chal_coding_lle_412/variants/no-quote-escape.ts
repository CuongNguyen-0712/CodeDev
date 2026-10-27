import { readFileSync } from "node:fs";

// Wrong: escapes & < > but not quotes, so a link URL can close the href attribute.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(text: string): string {
    return text.replace(/[&<>]/g, (c) => ESCAPES[c]);
}

// One scan, left to right: a code span, else a link, else bold. Spans do not nest.
const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

function inline(text: string): string {
    let out = "";
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
        out += escapeHtml(text.slice(last, m.index));
        if (m[1] !== undefined) {
            out += `<code>${escapeHtml(m[1])}</code>`;
        } else if (m[2] !== undefined) {
            out += /^https?:\/\//i.test(m[3])
                ? `<a href="${escapeHtml(m[3])}" rel="noopener noreferrer">${escapeHtml(m[2])}</a>`
                : escapeHtml(m[2]);
        } else {
            out += `<strong>${escapeHtml(m[4])}</strong>`;
        }
        last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
}

function renderFeedback(markdown: string): string {
    if (typeof markdown !== "string") return "";
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: { tag: "ul" | "ol"; items: string[] } | null = null;

    const flush = (): void => {
        if (paragraph.length > 0) {
            blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }
        if (list) {
            blocks.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`);
            list = null;
        }
    };

    const lines = markdown.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("```")) {
            flush();
            const code: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith("```")) {
                code.push(lines[i]);
                i++;
            }
            blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
            continue;
        }
        if (line === "") {
            flush();
            continue;
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        const numbered = /^\d+\.\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            const tag = bullet ? "ul" : "ol";
            if (paragraph.length > 0 || (list && list.tag !== tag)) flush();
            if (!list) list = { tag, items: [] };
            list.items.push((bullet ?? numbered)![1]);
            continue;
        }
        if (list) flush();
        paragraph.push(line);
    }
    flush();
    return blocks.join("\n");
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a JSON array of model outputs (feedback texts in markdown). Output: for each one, a line
// "=== feedback <n> ===" followed by the HTML that renderFeedback returns for it.
const outputs: unknown[] = JSON.parse(readFileSync(0, "utf8"));
outputs.forEach((markdown, i) => {
    console.log(`=== feedback ${i + 1} ===`);
    console.log(renderFeedback(markdown as string));
});
