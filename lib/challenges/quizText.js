/**
 * Splits quiz text (question, option, explanation) into what the quiz renders.
 * Segments: { kind: "code", lang, code } | { kind: "pre", code } | { kind: "text", text, strong? }.
 *
 * - ```lang fences are code blocks (the convention since 2026-11; content/README.md).
 * - Older questions put evidence before "\n\nStatement:" as plain text: each paragraph of it
 *   that has a line break, starts indented, or is one line without closing punctuation (code,
 *   logs, URLs, aligned tables) keeps its layout as "pre"; sentences stay text.
 * Inline `code` inside text segments is split later by splitInlineCode.
 */
const FENCE = /```([\w+#.-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```/g;
const STATEMENT = "\n\nStatement:";

function textSegments(text, strong = false) {
    return text.trim() ? [{ kind: "text", text: text.replace(/^\n+|\n+$/g, ""), ...(strong ? { strong } : {}) }] : [];
}

function legacySegments(text) {
    const at = text.indexOf(STATEMENT);
    if (at === -1) return textSegments(text);

    const evidence = text.slice(0, at).split(/\n{2,}/).flatMap((paragraph) => {
        if (!paragraph.trim()) return [];
        // Code, logs, URLs and tables: several lines, indented, or one line that is not a sentence.
        return paragraph.includes("\n") || /^ {2,}|^\t/.test(paragraph) || !/[.:?!)"']\s*$/.test(paragraph)
            ? [{ kind: "pre", code: paragraph.replace(/\s+$/, "") }]
            : textSegments(paragraph);
    });
    return [...evidence, ...textSegments(text.slice(at + 2), true)];
}

export function parseQuizText(text) {
    const source = String(text ?? "").replace(/\r\n/g, "\n");
    if (!source.includes("```")) return legacySegments(source);

    const segments = [];
    let last = 0;
    for (const match of source.matchAll(FENCE)) {
        segments.push(...textSegments(source.slice(last, match.index)));
        segments.push({ kind: "code", lang: match[1] || "", code: match[2] });
        last = match.index + match[0].length;
    }
    segments.push(...textSegments(source.slice(last)));
    return segments;
}

/** "a `b` c" -> [{ code: false, value: "a " }, { code: true, value: "b" }, { code: false, value: " c" }] */
export function splitInlineCode(text) {
    return String(text).split(/(`[^`\n]+`)/).filter(Boolean).map((part) =>
        /^`[^`\n]+`$/.test(part) ? { code: true, value: part.slice(1, -1) } : { code: false, value: part }
    );
}
