// @piece entropy: Shannon entropy in bits per character
const counts = new Map<string, number>();
for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
let h = 0;
for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log(p);
}
return h;
