// @piece normalize-labels: Keep and rewrite the labels of one point
const raw = p.labels ?? {};
const labels = new Map<string, string>();
for (const [name, value] of Object.entries(raw)) {
    if (FORBIDDEN.has(name) || value === "") continue;
    if (name === "path") {
        labels.set("path", value);
    } else if (name === "status") {
        labels.set("status", statusClass(value));
    } else {
        labels.set(name, value);
    }
}
