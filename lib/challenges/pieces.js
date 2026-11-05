/**
 * Piece-assembly coding challenges (content/README.md "Pieces"). Plain ESM with no dependencies:
 * used by the editor in the browser, the server and content/tools.
 *
 * The author marks blocks of the complete solution:
 *     // @piece parse-port: PORT: digits only, 1-65535
 *     ...lines...
 *     // @end
 * The base code the learner starts from is the solution with each block replaced by one
 * placeholder line `// [ ] <label>` at the block's indent. Putting every piece back in its
 * placeholder gives the solution again (restore).
 */

export const INDENT = "  ";

/** Line comment of a challenge language: `#` for config files and python, `//` otherwise. */
export const commentToken = (language) => (/py|docker|nginx|ya?ml|hcl|terraform/i.test(language || "") ? "#" : "//");

const PIECE_RE = /^([ \t]*)(\/\/|#)\s*@piece\s+(\S+?)\s*:\s*(.*?)\s*$/;
const END_RE = /^[ \t]*(\/\/|#)\s*@end\s*$/;
export const PLACEHOLDER_RE = /^([ \t]*)(\/\/|#)\s*\[ \]\s*(.+?)\s*$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_LABEL = 60;

const normalize = (text) => String(text ?? "").replace(/\r\n/g, "\n");

export const indentBlock = (code, indent) => code.split("\n").map((line) => (line ? indent + line : line)).join("\n");

/** Removes `indent` from the start of every non-blank line (body lines are at least that deep). */
const dedent = (lines, indent) => lines.map((line) => (line.trim() ? line.slice(indent.length) : "")).join("\n");

/**
 * Splits a marked solution.
 * Returns { base, pieces: [{ id, label, code, indent }], errors: [string] }.
 */
export function parsePieces(solution, token) {
    const lines = normalize(solution).split("\n");
    const out = [];
    const pieces = [];
    const errors = [];
    let open = null;

    lines.forEach((line, i) => {
        const at = `line ${i + 1}`;
        const start = line.match(PIECE_RE);
        if (start) {
            if (open) errors.push(`${at}: @piece inside @piece "${open.id}" (pieces cannot nest)`);
            const [, indent, mark, id, label] = start;
            if (mark !== token) errors.push(`${at}: use "${token}" for markers in this language`);
            if (!ID_RE.test(id)) errors.push(`${at}: piece id "${id}" must be kebab-case`);
            if (!label || label.length > MAX_LABEL) errors.push(`${at}: piece "${id}" needs a label of 1-${MAX_LABEL} characters`);
            open = { id, label, indent, body: [], line: i + 1 };
            return;
        }
        if (END_RE.test(line)) {
            if (!open) {
                errors.push(`${at}: @end without @piece`);
                return;
            }
            if (!open.body.some((l) => l.trim())) errors.push(`line ${open.line}: piece "${open.id}" is empty`);
            // Blank first/last lines would not survive the round trip base + pieces == solution.
            else if (!open.body[0].trim() || !open.body.at(-1).trim()) {
                errors.push(`line ${open.line}: piece "${open.id}" starts or ends with a blank line`);
            }
            if (open.body.some((l) => l.trim() && !l.startsWith(open.indent))) {
                errors.push(`line ${open.line}: piece "${open.id}" has lines indented less than its marker`);
            }
            pieces.push({ id: open.id, label: open.label, indent: open.indent, code: dedent(open.body, open.indent).replace(/\n+$/, "") });
            out.push(`${open.indent}${token} [ ] ${open.label}`);
            open = null;
            return;
        }
        if (open) open.body.push(line);
        else out.push(line);
    });

    if (open) errors.push(`line ${open.line}: piece "${open.id}" has no @end`);
    const seenIds = new Set();
    const seenLabels = new Set();
    for (const p of pieces) {
        if (seenIds.has(p.id)) errors.push(`duplicate piece id "${p.id}"`);
        if (seenLabels.has(p.label)) errors.push(`duplicate piece label "${p.label}" (placeholders are found by label)`);
        seenIds.add(p.id);
        seenLabels.add(p.label);
    }
    return { base: out.join("\n"), pieces, errors };
}

/**
 * A distractor file: first line `@piece <sibling id>: <sibling label>`, the rest is the wrong code.
 * Returns { for, label, code } or { error }.
 */
export function parseDistractor(text, token) {
    const lines = normalize(text).replace(/\n+$/, "").split("\n");
    const head = lines[0]?.match(PIECE_RE);
    if (!head || head[2] !== token) return { error: `first line must be "${token} @piece <piece id>: <label>"` };
    const body = lines.slice(1).filter((l, i, all) => l.trim() || i < all.length - 1);
    if (!body.some((l) => l.trim())) return { error: "the distractor has no code" };
    const indent = body.filter((l) => l.trim()).reduce((min, l) => {
        const own = l.match(/^[ \t]*/)[0];
        return own.length < min.length ? own : min;
    }, body.find((l) => l.trim()).match(/^[ \t]*/)[0]);
    return { for: head[3], label: head[4], code: dedent(body, indent).replace(/\n+$/, "") };
}

/** The placeholder line for `label`: { from, to, indent } (to = end of the line), or null. */
export function findPlaceholder(text, label) {
    if (!label) return null;
    let from = 0;
    for (const line of String(text).split("\n")) {
        const m = line.replace(/\r$/, "").match(PLACEHOLDER_RE);
        if (m && m[3] === label.trim()) return { from, to: from + line.replace(/\r$/, "").length, indent: m[1] };
        from += line.length + 1;
    }
    return null;
}

/** The placeholder line that contains `index` (any label): { from, to, indent }, or null. */
export function placeholderAt(text, index) {
    const from = text.lastIndexOf("\n", index - 1) + 1;
    const newline = text.indexOf("\n", index);
    const line = text.slice(from, newline === -1 ? text.length : newline).replace(/\r$/, "");
    const m = line.match(PLACEHOLDER_RE);
    return m ? { from, to: from + line.length, indent: m[1] } : null;
}

/** Replaces a placeholder line with the piece at its indent: { text, caret } (caret after the piece). */
export function replacePlaceholder(text, slot, code) {
    const block = indentBlock(normalize(code).replace(/\s+$/, ""), slot.indent);
    return { text: text.slice(0, slot.from) + block + text.slice(slot.to), caret: slot.from + block.length };
}

/** The solution as a learner would write it: the marker lines removed. restore() must give this. */
export function stripMarkers(solution) {
    return normalize(solution).split("\n").filter((line) => !PIECE_RE.test(line) && !END_RE.test(line)).join("\n");
}

/** Puts every piece back into its placeholder. Throws when a label has no placeholder. */
export function restore(base, pieces) {
    let text = normalize(base);
    for (const piece of pieces) {
        const slot = findPlaceholder(text, piece.label);
        if (!slot) throw new Error(`no placeholder for "${piece.label}"`);
        text = replacePlaceholder(text, slot, piece.code).text;
    }
    return text;
}
