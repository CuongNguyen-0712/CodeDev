/**
 * Filter / search contract shared by the list pages (URL), their API routes and the services
 * (cache keys). Isomorphic: no server-only imports.
 *
 * Every allowed value mirrors the database:
 *   level   -> level_enum              (catalog.course.level, roadmap.roadmaps.level)
 *   status  -> status_course_enum      (learning.register.status)
 *   price   -> catalog.course.cost     (free = 0, paid > 0)
 *   rating  -> catalog.course.rating   (integer 1..5, used as a minimum)
 *   language / category -> catalog.language.id / catalog.category.id
 *
 * URL format (canonical, defaults omitted):  ?q=react&level=beginner,advanced&rating=4
 * The parser also accepts the axios array style (`level[]=a&level[]=b`) and repeated keys.
 */

export const LEVELS = ["beginner", "intermediate", "advanced", "expert", "master"];
export const COURSE_STATUSES = ["enrolled", "in_progress", "paused", "completed", "cancelled"];
export const PRICES = ["free", "paid"];

export const SEARCH_MAX_LENGTH = 100;
const MAX_VALUES_PER_FIELD = 20;
const INT_MAX = 2_147_483_647;

/** Value used in the URL when a field with a default is explicitly cleared. */
export const ALL_TOKEN = "all";

const enumField = (values, extra = {}) => ({ kind: "enum", values, multiple: true, ...extra });
const intField = (min, max, extra = {}) => ({ kind: "int", min, max, multiple: true, ...extra });

export const LIST_SCHEMAS = {
    course: {
        level: enumField(LEVELS),
        price: enumField(PRICES, { multiple: false }),
        rating: intField(1, 5, { multiple: false }),
        language: intField(1, INT_MAX),
        category: intField(1, INT_MAX),
    },
    learning: {
        level: enumField(LEVELS),
        status: enumField(COURSE_STATUSES, { defaultValue: ["enrolled", "in_progress"] }),
    },
    roadmap: {
        level: enumField(LEVELS),
    },
};

function schemaFor(kind) {
    const schema = LIST_SCHEMAS[kind];
    if (!schema) throw new Error(`Unknown list schema: ${kind}`);
    return schema;
}

/** Trim, Unicode-normalise, collapse whitespace and cap the length of a search term. */
export function normalizeSearch(raw) {
    if (raw === null || raw === undefined) return "";
    return String(raw)
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, SEARCH_MAX_LENGTH);
}

/** Escapes LIKE wildcards so a search term is matched literally (`ESCAPE '\'`). */
export function escapeLike(term) {
    return String(term).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function readAll(input, key) {
    if (!input) return [];
    if (typeof input.getAll === "function") {
        return [...input.getAll(key), ...input.getAll(`${key}[]`)];
    }
    const raw = input[key] ?? input[`${key}[]`];
    if (raw === undefined || raw === null) return [];
    return Array.isArray(raw) ? raw : [raw];
}

function readOne(input, key) {
    if (!input) return undefined;
    if (typeof input.get === "function") return input.get(key) ?? undefined;
    const raw = input[key];
    return Array.isArray(raw) ? raw[0] : raw;
}

function cleanField(field, rawValues) {
    const tokens = rawValues
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    let values;
    if (field.kind === "enum") {
        const wanted = new Set(tokens);
        // Keep the schema order so equal filters always serialise the same way.
        values = field.values.filter((value) => wanted.has(value));
    } else {
        const numbers = new Set(
            tokens
                .filter((token) => /^\d{1,10}$/.test(token))
                .map(Number)
                .filter((n) => n >= field.min && n <= field.max)
        );
        values = [...numbers].sort((a, b) => a - b).map(String);
    }

    if (!field.multiple) values = values.slice(0, 1);
    return values.slice(0, MAX_VALUES_PER_FIELD);
}

function sameValues(a = [], b = []) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Default filter of a list (what the page shows with an empty URL). */
export function defaultFilter(kind) {
    const schema = schemaFor(kind);
    return Object.fromEntries(Object.entries(schema).map(([name, field]) => [name, [...(field.defaultValue || [])]]));
}

/**
 * Parses URLSearchParams (or a plain object) into `{ search, filter }`. Unknown keys and values
 * the database would reject are dropped, never passed through.
 */
export function parseListQuery(kind, input) {
    const schema = schemaFor(kind);
    const filter = {};

    for (const [name, field] of Object.entries(schema)) {
        const raw = readAll(input, name);
        if (field.defaultValue && raw.length === 0) {
            filter[name] = [...field.defaultValue];
        } else if (field.defaultValue && raw.some((value) => String(value).trim().toLowerCase() === ALL_TOKEN)) {
            filter[name] = [];
        } else {
            filter[name] = cleanField(field, raw);
        }
    }

    const search = normalizeSearch(readOne(input, "q") ?? readOne(input, "search"));
    return { search, filter };
}

/** Canonical params object (strings only, defaults omitted) for the URL and for API calls. */
export function toQueryParams(kind, { search = "", filter = {} } = {}) {
    const schema = schemaFor(kind);
    const params = {};

    const term = normalizeSearch(search);
    if (term) params.q = term;

    for (const [name, field] of Object.entries(schema)) {
        const values = cleanField(field, Array.isArray(filter[name]) ? filter[name] : filter[name] ? [filter[name]] : []);
        if (field.defaultValue) {
            if (sameValues(values, field.defaultValue)) continue;
            params[name] = values.length > 0 ? values.join(",") : ALL_TOKEN;
        } else if (values.length > 0) {
            params[name] = values.join(",");
        }
    }

    return params;
}

export function toQueryString(kind, state) {
    return new URLSearchParams(toQueryParams(kind, state)).toString();
}

/** True when the state differs from the list's default view. */
export function isFiltered(kind, state) {
    return Object.keys(toQueryParams(kind, state)).length > 0;
}

/**
 * Stable identity of a query for caching: the search term is case-folded because every text
 * filter is matched with ILIKE.
 */
export function listCacheIdentity(kind, state, extra = {}) {
    const params = toQueryParams(kind, state);
    if (params.q) params.q = params.q.toLowerCase();
    return JSON.stringify({ kind, ...params, ...extra });
}
