// @piece semver-compare: SemVer precedence of two versions
const x = parseSemver(a);
const y = parseSemver(b);
if (!x || !y) return null;
if (a !== b) return byString(a, b);
for (const k of ["major", "minor", "patch"] as const) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
}
if (x.pre.length === 0 || y.pre.length === 0) return Math.sign(y.pre.length - x.pre.length);
for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const c = compareIdentifiers(x.pre[i], y.pre[i]);
    if (c !== 0) return c;
}
return Math.sign(x.pre.length - y.pre.length);
