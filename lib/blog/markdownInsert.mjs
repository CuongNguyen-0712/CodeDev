// The editor's Markdown buttons. Each takes the text and the selection, and returns the new text with
// the range to select next, so the writer can type over the placeholder or keep their own words.

const lineStart = (text, at) => text.lastIndexOf("\n", at - 1) + 1;
const lineEnd = (text, at) => {
    const end = text.indexOf("\n", at);
    return end === -1 ? text.length : end;
};

// Bold, inline code, link: wrap the selection, or insert a placeholder and select it.
function wrap(text, start, end, before, after, placeholder) {
    const inner = text.slice(start, end) || placeholder;
    const next = text.slice(0, start) + before + inner + after + text.slice(end);
    return { text: next, start: start + before.length, end: start + before.length + inner.length };
}

// Headings and lists: change the start of every line the selection touches.
function prefixLines(text, start, end, edit) {
    const from = lineStart(text, start);
    const to = lineEnd(text, Math.max(start, end - (end > start && text[end - 1] === "\n" ? 1 : 0)));
    const lines = text.slice(from, to).split("\n").map(edit);
    const block = lines.join("\n");
    // Caret at the end of the edited lines: a selected "## " would be replaced by the next key press.
    return { text: text.slice(0, from) + block + text.slice(to), start: from + block.length, end: from + block.length };
}

const heading = (level) => (text, start, end) =>
    prefixLines(text, start, end, (line) => `${"#".repeat(level)} ${line.replace(/^#{1,6}\s+/, "")}`);

export const MARKDOWN_ACTIONS = {
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    bold: (text, start, end) => wrap(text, start, end, "**", "**", "bold text"),
    code: (text, start, end) => wrap(text, start, end, "`", "`", "code"),
    list: (text, start, end) => prefixLines(text, start, end, (line) => (/^\s*[-*+]\s/.test(line) ? line : `- ${line}`)),
    link: (text, start, end) => {
        const label = text.slice(start, end);
        const inserted = `[${label || "text"}](https://)`;
        const next = text.slice(0, start) + inserted + text.slice(end);
        // With a label the URL is what is left to write; without one, the label is.
        return label
            ? { text: next, start: start + label.length + 3, end: start + inserted.length - 1 }
            : { text: next, start: start + 1, end: start + 5 };
    },
    // A fenced block on lines of its own, named so the reader sees the file; the code (or "code") is selected.
    codeblock: (text, start, end) => {
        const inner = text.slice(start, end) || "code";
        const before = start > 0 && text[start - 1] !== "\n" ? "\n" : "";
        const after = end < text.length && text[end] !== "\n" ? "\n" : "";
        const open = `${before}\`\`\`js app.js\n`;
        const next = text.slice(0, start) + open + inner + "\n```" + after + text.slice(end);
        return { text: next, start: start + open.length, end: start + open.length + inner.length };
    },
};

/** Applies one of MARKDOWN_ACTIONS to `text` with the selection [start, end). */
export const applyMarkdown = (action, text, start, end) => MARKDOWN_ACTIONS[action](text, start, end);
