// Name of the first function declared in the starter code (function decl or const arrow/function).
// Shared by the browser runner and the server-side code runner so both call the same entry.
export function detectEntryName(source = '') {
    const patterns = [
        /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
        /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) return match[1];
    }
    return null;
}
