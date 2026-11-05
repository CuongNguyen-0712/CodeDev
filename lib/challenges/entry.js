const ENTRY_PATTERNS = [
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
];

// Earliest declaration matched by either pattern (the regex match keeps its index).
function matchEntry(source = '') {
    let best = null;
    for (const pattern of ENTRY_PATTERNS) {
        const match = source.match(pattern);
        if (match && (!best || match.index < best.index)) best = match;
    }
    return best;
}

// Name of the first function declared in the starter code (function decl or const arrow/function).
// Shared by the browser runner and the server-side code runner so both call the same entry.
export function detectEntryName(source = '') {
    for (const pattern of ENTRY_PATTERNS) {
        const match = source.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Index where the first line inside the entry function's body starts (after its opening `{` and
 * that line's end), or null when there is no entry or it has an expression body. Snippets go
 * here when the learner has not placed the caret yet.
 */
export function entryBodyStart(source = '') {
    const match = matchEntry(source);
    if (!match) return null;
    // shortcut: a default-param object literal before the body brace mis-targets; upgrade to a paren-depth scan if a starter uses one
    const after = match.index + match[0].length;
    const brace = source.indexOf('{', after);
    if (brace === -1) return null;
    // `const f = (a) => a + 1` (expression body): the next `{` belongs to something else.
    if (match[0].endsWith('=>') && source.slice(after, brace).trim()) return null;
    const lineEnd = source.indexOf('\n', brace);
    return lineEnd === -1 ? brace + 1 : lineEnd + 1;
}
