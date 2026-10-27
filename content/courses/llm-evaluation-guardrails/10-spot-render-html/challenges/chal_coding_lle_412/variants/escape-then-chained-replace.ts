import { readFileSync } from "node:fs";

// Wrong: escapes first, then runs one regex replace after another, so spans nest and overlap.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function inline(text: string): string {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all: string, label: string, url: string) =>
            /^https?:\/\//i.test(url) ? `<a href="${url}" rel="noopener noreferrer">${label}</a>` : label);
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
