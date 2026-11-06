// @piece fingerprint: Hash every k-gram, keep each window's minimum
const text = normalise(code);
const hashes: number[] = [];
for (let i = 0; i + K <= text.length; i++) {
    let h = 0;
    for (let j = i; j < i + K; j++) h = (h * 31 + text.charCodeAt(j)) % MOD;
    hashes.push(h);
}
const prints = new Set<number>();
if (hashes.length === 0) return prints;
const windows = Math.max(1, hashes.length - W + 1);
for (let start = 0; start < windows; start++) {
    for (const h of hashes) prints.add(h);
}
return prints;
