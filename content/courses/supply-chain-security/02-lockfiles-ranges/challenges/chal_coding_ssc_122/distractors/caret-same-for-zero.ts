// @piece caret-tilde: Caret and tilde ranges
if (spec.startsWith("^") || spec.startsWith("~")) {
    const v = full(spec.slice(1));
    if (!v) return null;
    if (spec[0] === "~") return { lower: at(v), upper: at([v[0], v[1] + 1, 0], false) };
    const upper: V = [v[0] + 1, 0, 0];
    return { lower: at(v), upper: at(upper, false) };
}
