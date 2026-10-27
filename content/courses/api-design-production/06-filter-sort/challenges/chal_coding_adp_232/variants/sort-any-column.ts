import { readFileSync } from "node:fs";

// GET /courses?level=beginner,intermediate&price[lte]=200000&sort=-rating,title&q=react
// parseListQuery turns the raw query string (without "?") into a query plan that the repository
// can turn into SQL with placeholders, or into the list of every problem found (400).
// Only the fields and operators in FILTERS and the fields in SORTABLE can reach the SQL.
//
// 1. Split the string on "&" and skip empty parts. Each part is name=value, split at the first "="
//    (no "=" -> the value is ""). Decode name and value: "+" means a space, then percent-decoding
//    (decodeURIComponent). If either cannot be decoded -> malformed percent-encoding in "<part>",
//    where <part> is the raw text of that parameter.
// 2. The decoded name must look like field or field[op]: lowercase letters and "_", op lowercase
//    letters -> else invalid parameter name "<name>". A name seen before -> duplicate parameter "<name>".
// 3. "limit" and "cursor" belong to the pagination code: skip them. "q": the value trimmed must have
//    1-100 characters -> else "q" must be 1-100 characters; the plan keeps the trimmed text.
// 4. "sort": split the value on ","; more than MAX_SORT items -> too many sort fields (max 3). Each
//    item is a field, "-" in front = descending. Field not in SORTABLE -> cannot sort by "<field>";
//    a field twice -> "<field>" appears twice in sort. The plan's sort ends with the tie-break
//    { field: "id", dir: <dir of the last item> }. No sort parameter -> published_at desc, then id desc.
// 5. Any other name is a filter. Split the value on ",". Field not in FILTERS -> unknown filter "<field>".
//    The operator is the one in brackets, or "eq" for one value and "in" for more. Operator not in the
//    field's ops -> operator "<op>" is not allowed on "<field>". More than one value with an operator
//    other than "in" -> "<name>" takes one value. More than MAX_LIST values -> too many values for
//    "<field>" (max 10). Then every value, left to right, is coerced; the first bad one ->
//    invalid value "<value>" for "<field>": expected <rule.expected>.
//      enum     one of rule.values (kept as a string)
//      string   1 to rule.maxLength characters (kept as a string)
//      integer  digits only, at most Number.MAX_SAFE_INTEGER (-> number)
//      number   digits, optionally "." and digits, from rule.min to rule.max (-> number)
//      boolean  "true" or "false" (-> boolean)
//    The filter is { field, op, value }: value is the coerced value, or the array of them for "in".
// One error per parameter at most (the first check that fails, in the order above), all parameters
// checked, errors in the order of the query string. Filters in the plan keep the query order.

type Rule = {
    type: "enum" | "string" | "integer" | "number" | "boolean";
    ops: string[];
    expected: string;
    values?: string[];
    maxLength?: number;
    min?: number;
    max?: number;
};
type Value = string | number | boolean;
type Filter = { field: string; op: string; value: Value | Value[] };
type SortKey = { field: string; dir: "asc" | "desc" };
type Plan = { filters: Filter[]; sort: SortKey[]; q: string | null };
type Result = { status: 200; plan: Plan } | { status: 400; errors: string[] };

const FILTERS: Record<string, Rule> = {
    level: { type: "enum", ops: ["eq", "in"], values: ["beginner", "intermediate", "advanced", "expert"], expected: "one of beginner, intermediate, advanced, expert" },
    category: { type: "string", ops: ["eq", "in"], maxLength: 40, expected: "1-40 characters" },
    price: { type: "integer", ops: ["eq", "gte", "lte"], expected: "a whole number" },
    rating: { type: "number", ops: ["gte", "lte"], min: 0, max: 5, expected: "a number from 0 to 5" },
    is_free: { type: "boolean", ops: ["eq"], expected: "true or false" },
};
const SORTABLE = ["title", "rating", "price", "published_at"];
const MAX_LIST = 10;
const MAX_SORT = 3;

function decode(raw: string): string | null {
    try {
        return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
        return null;
    }
}

function coerce(rule: Rule, v: string): Value | null {
    switch (rule.type) {
        case "enum":
            return rule.values!.includes(v) ? v : null;
        case "string":
            return v.length >= 1 && v.length <= rule.maxLength! ? v : null;
        case "integer":
            return /^\d+$/.test(v) && Number(v) <= Number.MAX_SAFE_INTEGER ? Number(v) : null;
        case "number": {
            if (!/^\d+(\.\d+)?$/.test(v)) return null;
            const n = Number(v);
            return n >= rule.min! && n <= rule.max! ? n : null;
        }
        case "boolean":
            return v === "true" ? true : v === "false" ? false : null;
    }
}

// Returns an error message, or null after adding the filter to the plan.
function parseFilter(name: string, value: string, plan: Plan): string | null {
    const [, field, explicitOp] = name.match(/^([a-z_]+)(?:\[([a-z]+)\])?$/)!;
    const rule = FILTERS[field];
    if (!rule) return `unknown filter "${field}"`;
    const raw = value.split(",");
    const op = explicitOp ?? (raw.length > 1 ? "in" : "eq");
    if (!rule.ops.includes(op)) return `operator "${op}" is not allowed on "${field}"`;
    if (op !== "in" && raw.length > 1) return `"${name}" takes one value`;
    if (raw.length > MAX_LIST) return `too many values for "${field}" (max ${MAX_LIST})`;
    const values: Value[] = [];
    for (const v of raw) {
        const coerced = coerce(rule, v);
        if (coerced === null) return `invalid value "${v}" for "${field}": expected ${rule.expected}`;
        values.push(coerced);
    }
    plan.filters.push({ field, op, value: op === "in" ? values : values[0] });
    return null;
}

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

function parseListQuery(query: string): Result {
    const plan: Plan = { filters: [], sort: [{ field: "published_at", dir: "desc" }, { field: "id", dir: "desc" }], q: null };
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const part of query.split("&")) {
        if (part === "") continue;
        const eq = part.indexOf("=");
        const name = decode(eq === -1 ? part : part.slice(0, eq));
        const value = decode(eq === -1 ? "" : part.slice(eq + 1));
        if (name === null || value === null) {
            errors.push(`malformed percent-encoding in "${part}"`);
            continue;
        }
        if (!/^[a-z_]+(\[[a-z]+\])?$/.test(name)) {
            errors.push(`invalid parameter name "${name}"`);
            continue;
        }
        if (seen.has(name)) {
            errors.push(`duplicate parameter "${name}"`);
            continue;
        }
        seen.add(name);
        if (name === "limit" || name === "cursor") continue;
        if (name === "q") {
            const q = value.trim();
            if (q.length < 1 || q.length > 100) errors.push(`"q" must be 1-100 characters`);
            else plan.q = q;
        } else if (name === "sort") {
            const sort = parseSort(value);
            if (typeof sort === "string") errors.push(sort);
            else plan.sort = sort;
        } else {
            const error = parseFilter(name, value, plan);
            if (error !== null) errors.push(error);
        }
    }
    return errors.length > 0 ? { status: 400, errors } : { status: 200, plan };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "queries": ["<query string without ?>", ...] }. Prints one result per query, as JSON.
const input: { queries: string[] } = JSON.parse(readFileSync(0, "utf8"));
for (const query of input.queries) console.log(JSON.stringify(parseListQuery(query)));
