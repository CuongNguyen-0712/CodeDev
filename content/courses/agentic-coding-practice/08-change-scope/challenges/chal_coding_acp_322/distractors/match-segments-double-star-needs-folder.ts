// @piece match-segments: Helper: match segment lists, ** included
function matchSegments(p: string[], i: number, s: string[], j: number): boolean {
    if (i === p.length) return j === s.length;
    if (p[i] === "**") return j < s.length && (matchSegments(p, i + 1, s, j + 1) || matchSegments(p, i, s, j + 1));
    return j < s.length && segmentMatches(p[i], s[j]) && matchSegments(p, i + 1, s, j + 1);
}
