// @piece check-assertion: Run one assertion against the output
function check(a: Assertion, recorded: string | null): boolean {
    const output = recorded ?? "";
    switch (a.type) {
        case "is_json":
            return parse(output).ok;
        case "json_schema": {
            const p = parse(output);
            return p.ok && matches(a.schema as Record<string, unknown>, p.value);
        }
        case "contains":
        case "not_contains": {
            const value = a.value as string;
            const found = a.ignoreCase === true ? output.toLowerCase().includes(value.toLowerCase()) : output.includes(value);
            return a.type === "contains" ? found : !found;
        }
        case "regex":
            return new RegExp(a.pattern as string, (a.flags as string | undefined) ?? "").test(output);
        case "max_length":
            return Array.from(output).length <= (a.value as number);
        case "equals_field": {
            const f = field(output, a.path as string);
            return f.found && deepEqual(f.value, a.value);
        }
        case "score_in_range": {
            const f = field(output, a.path as string);
            return f.found && typeof f.value === "number" && f.value >= (a.min as number) && f.value <= (a.max as number);
        }
    }
    return false;
}
