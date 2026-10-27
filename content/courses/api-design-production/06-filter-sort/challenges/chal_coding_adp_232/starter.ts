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

// Write parseListQuery (helpers are welcome). Do not change the types, FILTERS, SORTABLE, the limits or the test runner.
function parseListQuery(query: string): Result {
    return { status: 200, plan: { filters: [], sort: [], q: null } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "queries": ["<query string without ?>", ...] }. Prints one result per query, as JSON.
const input: { queries: string[] } = JSON.parse(readFileSync(0, "utf8"));
for (const query of input.queries) console.log(JSON.stringify(parseListQuery(query)));
