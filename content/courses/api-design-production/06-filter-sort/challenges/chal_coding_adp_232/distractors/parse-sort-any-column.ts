// @piece parse-sort: Check the sort list and add the id tie-break
function parseSort(value: string): SortKey[] | string {
    const items = value.split(",");
    if (items.length > MAX_SORT) return `too many sort fields (max ${MAX_SORT})`;
    const keys: SortKey[] = [];
    for (const item of items) {
        const field = item.startsWith("-") ? item.slice(1) : item;
        if (!/^[a-z_]+$/.test(field)) return `cannot sort by "${field}"`;
        if (keys.some((k) => k.field === field)) return `"${field}" appears twice in sort`;
        keys.push({ field, dir: item.startsWith("-") ? "desc" : "asc" });
    }
    return [...keys, { field: "id", dir: keys[keys.length - 1].dir }];
}
