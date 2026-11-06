// @piece compare-key: Order two (published_at, id) keys
function compareKey(a: [string, number], b: [string, number]): number {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return 0;
}
