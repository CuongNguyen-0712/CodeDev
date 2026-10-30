import { readFileSync } from "node:fs";

// CodeDev course search. Written by the coding agent from the prompt:
//   "Add a course search: learners type part of a title and can filter by level.
//    Only published courses, sorted by title."
//
// buildSearchQuery(term, level) returns the SQL text and its parameter values for:
//   SELECT id, title FROM courses WHERE published = 1 AND title LIKE <pattern> [AND level = <level>] ORDER BY title
// - term is what the learner typed (any text, may be empty); a course matches when its title
//   contains term, ignoring case.
// - level is "beginner", "intermediate", "advanced" or null (null = any level, no level condition).
// - The database supports ? placeholders: each ? takes the next value of params, in order.
//
// The function is the only thing you change. Do not change the types or the test runner.

interface SearchQuery {
    sql: string;
    params: string[];
}

function buildSearchQuery(term: string, level: string | null): SearchQuery {
    // Values travel as parameters, never inside the SQL text: a quote in the input stays data.
    let sql = "SELECT id, title FROM courses WHERE published = 1 AND title LIKE ?";
    const params = ["%" + term + "%"];
    if (level !== null) {
        sql += " AND level = ?";
        params.push(level);
    }
    sql += " ORDER BY title";
    return { sql, params };
}

// ---------------------------------------------------------------- test runner (do not change)
// A tiny fake database. It reads the SQL the way a real database does: a single-quoted literal ends at
// the next quote ('' inside a literal is one quote), -- starts a comment, ? takes the next parameter.
// It supports SELECT id, title FROM courses WHERE <condition> [ORDER BY title], where <condition> uses
// AND, OR, NOT, parentheses, = , <>, LIKE (case-insensitive, % and _ wildcards), columns, strings and numbers.

interface Course { id: string; title: string; level: string; published: number }
interface Search { term: string; level: string | null }
interface TestInput { courses: Course[]; generatedCourses?: number; searches: Search[] }
type Value = string | number;
type Token = { kind: "word" | "str" | "num" | "param" | "sym"; text: string };
type Expr =
    | { op: "and" | "or"; left: Expr; right: Expr }
    | { op: "not"; inner: Expr }
    | { op: "=" | "<>" | "like"; left: Operand; right: Operand };
type Operand = { column: keyof Course } | { value: Value };

function tokenize(sql: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < sql.length) {
        const c = sql[i];
        if (/\s/.test(c)) { i++; continue; }
        if (sql.startsWith("--", i)) break;
        if (c === "'") {
            let text = "";
            i++;
            for (;;) {
                if (i >= sql.length) throw new Error("unterminated string literal");
                if (sql[i] === "'") {
                    if (sql[i + 1] === "'") { text += "'"; i += 2; continue; }
                    i++;
                    break;
                }
                text += sql[i++];
            }
            tokens.push({ kind: "str", text });
            continue;
        }
        const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
        if (word) { tokens.push({ kind: "word", text: word[0] }); i += word[0].length; continue; }
        const num = /^[0-9]+/.exec(sql.slice(i));
        if (num) { tokens.push({ kind: "num", text: num[0] }); i += num[0].length; continue; }
        if (c === "?") { tokens.push({ kind: "param", text: c }); i++; continue; }
        if (sql.startsWith("<>", i) || sql.startsWith("!=", i)) { tokens.push({ kind: "sym", text: "<>" }); i += 2; continue; }
        if ("=,()".includes(c)) { tokens.push({ kind: "sym", text: c }); i++; continue; }
        if (c === ";") throw new Error("only one statement is allowed");
        throw new Error(`syntax error near "${sql.slice(i, i + 12)}"`);
    }
    return tokens;
}

function parse(sql: string, params: string[]): { where: Expr; ordered: boolean } {
    const tokens = tokenize(sql);
    let pos = 0;
    let nextParam = 0;
    const peek = (): Token | undefined => tokens[pos];
    const isWord = (w: string): boolean => peek()?.kind === "word" && peek()?.text.toUpperCase() === w;
    const expect = (text: string): void => {
        const t = tokens[pos++];
        if (!t || t.text.toUpperCase() !== text.toUpperCase()) throw new Error(`syntax error: expected ${text} near "${t ? t.text : "end of query"}"`);
    };
    const operand = (): Operand => {
        const t = tokens[pos++];
        if (!t) throw new Error("syntax error: unexpected end of query");
        if (t.kind === "str") return { value: t.text };
        if (t.kind === "num") return { value: Number(t.text) };
        if (t.kind === "param") {
            if (nextParam >= params.length) throw new Error("not enough parameter values for the ? placeholders");
            return { value: params[nextParam++] };
        }
        const name = t.text.toLowerCase();
        if (t.kind === "word" && (name === "id" || name === "title" || name === "level" || name === "published")) return { column: name };
        throw new Error(`syntax error near "${t.text}"`);
    };
    const primary = (): Expr => {
        if (isWord("NOT")) { pos++; return { op: "not", inner: primary() }; }
        if (peek()?.text === "(") { pos++; const inner = orExpr(); expect(")"); return inner; }
        const left = operand();
        const t = tokens[pos++];
        const op = t?.text === "=" ? "=" : t?.text === "<>" ? "<>" : t?.text.toUpperCase() === "LIKE" ? "like" : null;
        if (op === null) throw new Error(`syntax error near "${t ? t.text : "end of query"}"`);
        return { op, left, right: operand() };
    };
    const andExpr = (): Expr => {
        let left = primary();
        while (isWord("AND")) { pos++; left = { op: "and", left, right: primary() }; }
        return left;
    };
    const orExpr = (): Expr => {
        let left = andExpr();
        while (isWord("OR")) { pos++; left = { op: "or", left, right: andExpr() }; }
        return left;
    };
    for (const w of ["SELECT", "id", ",", "title", "FROM", "courses", "WHERE"]) expect(w);
    const where = orExpr();
    let ordered = false;
    if (isWord("ORDER")) { pos++; expect("BY"); expect("title"); ordered = true; }
    if (pos < tokens.length) throw new Error(`syntax error near "${tokens[pos].text}"`);
    if (nextParam !== params.length) throw new Error("more parameter values than ? placeholders");
    return { where, ordered };
}

function likeToRegExp(pattern: string): RegExp {
    let source = "";
    for (const ch of pattern) {
        source += ch === "%" ? "[\\s\\S]*" : ch === "_" ? "[\\s\\S]" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${source}$`, "i");
}

function evaluate(e: Expr, row: Course): boolean {
    const val = (o: Operand): Value => ("column" in o ? row[o.column] : o.value);
    switch (e.op) {
        case "and": return evaluate(e.left, row) && evaluate(e.right, row);
        case "or": return evaluate(e.left, row) || evaluate(e.right, row);
        case "not": return !evaluate(e.inner, row);
        case "=": return String(val(e.left)) === String(val(e.right));
        case "<>": return String(val(e.left)) !== String(val(e.right));
        case "like": return likeToRegExp(String(val(e.right))).test(String(val(e.left)));
    }
}

const input: TestInput = JSON.parse(readFileSync(0, "utf8"));
const courses = [...input.courses];
for (let i = 1; i <= (input.generatedCourses ?? 0); i++) {
    const level = ["beginner", "intermediate", "advanced"][i % 3];
    courses.push({ id: `g_${i}`, title: `Workshop ${String(i).padStart(4, "0")}`, level, published: i % 5 === 0 ? 0 : 1 });
}
const sqlTexts = new Set<string>();
const results = input.searches.map((s) => {
    const query = buildSearchQuery(s.term, s.level);
    sqlTexts.add(query.sql);
    try {
        const { where, ordered } = parse(query.sql, query.params);
        const rows = courses.filter((row) => evaluate(where, row));
        if (ordered) rows.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
        return { term: s.term, level: s.level, titles: rows.map((row) => row.title) };
    } catch (err) {
        return { term: s.term, level: s.level, error: err instanceof Error ? err.message : String(err) };
    }
});
// A real database parses and plans each distinct SQL text once: values belong in params, not in the text.
console.log(JSON.stringify({ results, distinctSqlTexts: sqlTexts.size }));
