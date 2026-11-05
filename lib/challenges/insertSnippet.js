import { INDENT, indentBlock } from "./pieces.js";

/**
 * Inserts a snippet into the editor text at the caret (start..end) and returns
 * { text, caret } with the caret right after the snippet. Pure: used by CodeEditor.
 *
 * - A selection is replaced; the snippet's later lines get the selection line's indent.
 * - Caret inside code on a line: the snippet goes on a new line below, never splitting the code.
 * - Caret on a blank line: the snippet replaces the blank, at that line's indent.
 * - Caret in a line's leading whitespace: the snippet goes above the line, one level deeper when
 *   the line closes a block (`}`), so it lands inside the function body.
 */
export function insertSnippetText(text, start, end, snippet) {
    const code = String(snippet).replace(/\r\n/g, "\n").replace(/\s+$/, "");
    const from = text.lastIndexOf("\n", start - 1) + 1;
    const newline = text.indexOf("\n", start);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(from, lineEnd).replace(/\r$/, "");
    const lineIndent = line.match(/^[ \t]*/)[0];

    if (end > start) {
        const block = code.split("\n").map((l, i) => (i === 0 || !l ? l : lineIndent + l)).join("\n");
        return { text: text.slice(0, start) + block + text.slice(end), caret: start + block.length };
    }

    if (text.slice(from, start).trim()) {
        const at = text[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
        const block = "\n" + indentBlock(code, lineIndent);
        return { text: text.slice(0, at) + block + text.slice(at), caret: at + block.length };
    }

    if (!line.trim()) {
        const to = from + line.length;
        const block = indentBlock(code, lineIndent);
        return { text: text.slice(0, from) + block + text.slice(to), caret: from + block.length };
    }

    const indent = /^[}\])]/.test(line.trim()) ? lineIndent + INDENT : lineIndent;
    const block = indentBlock(code, indent);
    return { text: text.slice(0, from) + block + "\n" + text.slice(from), caret: from + block.length };
}
