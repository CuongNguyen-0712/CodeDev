// @piece cap-values: Cap the distinct values of each label
if (!capped.has(p.metric)) capped.set(p.metric, new Set());
for (const [name, value] of labels) {
    const key = name;
    const values = kept.get(key) ?? new Set<string>();
    kept.set(key, values);
    if (values.has(value)) continue;
    if (values.size < maxValuesPerLabel) values.add(value);
    else {
        labels.set(name, "other");
        capped.get(p.metric)!.add(name);
    }
}
