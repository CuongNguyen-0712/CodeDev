// @piece names: Redact roster names as whole words
const names = [...new Set(roster.map((r) => fold(r.trim())).filter((r) => r.length > 0))].sort((a, b) => b.length - a.length);
const folded = fold(out);
const isWordChar = (_c: string | undefined) => false;
let result = "";
let i = 0;
while (i < out.length) {
    const name = isWordChar(folded[i - 1]) ? undefined : names.find((n) => folded.startsWith(n, i) && !isWordChar(folded[i + n.length]));
    if (name) {
        result += label("NAME", name);
        i += name.length;
    } else {
        result += out[i];
        i++;
    }
}
