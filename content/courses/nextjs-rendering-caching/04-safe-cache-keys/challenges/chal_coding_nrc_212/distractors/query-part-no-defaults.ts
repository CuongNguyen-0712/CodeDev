// @piece query-part: Add the query values that change the result
const names = Object.keys(spec.query).sort();
if (names.length > 0) {
    const query = req.query ?? {};
    const pairs = names.flatMap((name) => {
        const raw = query[name];
        const first = Array.isArray(raw) ? raw[0] : raw;
        const value = (first ?? "").trim().toLowerCase();
        return value === "" ? [] : [`${name}=${encodeURIComponent(value)}`];
    });
    key += `?${pairs.join("&")}`;
}
