import { readFileSync } from "node:fs";

// Catalog reducer. The course catalog of CodeDev keeps its search box, category chips, level filter,
// sort and page in one state object that only catalogReducer may change (useReducer in the page).
//
// Rules (every "same state" below means: return the `state` argument itself, not a copy):
//   searchTyped     text is a string, different from state.search -> search = text, page = 1
//                   (store the text as typed, spaces included)
//   categoryToggled category is one of CATEGORIES -> removed when present, appended at the end when not;
//                   page = 1
//   levelSet        level is one of LEVELS, different from state.level -> level, page = 1
//   sortChanged     sort is one of SORTS, different from state.sort -> sort, page = 1
//   pageChanged     page is an integer from 1 to state.totalPages, different from state.page -> page
//   filtersReset    search "", categories [], level "all", page 1 (sort and totalPages stay);
//                   same state when all four already have those values
//   resultsLoaded   totalPages is an integer >= 0 -> totalPages = max(1, it), page = min(page, totalPages);
//                   same state when neither value changes
//   anything else   (unknown type, a value outside the types, a missing field) -> same state
//
// Never change the state you receive or its categories array: build a new object.
// Do not change the types, the constants or the test runner.

const CATEGORIES = ["react", "node", "sql", "python", "devops"] as const;
const LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
const SORTS = ["newest", "rating", "popular"] as const;

type Category = (typeof CATEGORIES)[number];
type LevelFilter = (typeof LEVELS)[number];
type Sort = (typeof SORTS)[number];

type CatalogState = {
    search: string;
    categories: Category[];
    level: LevelFilter;
    sort: Sort;
    page: number;
    totalPages: number;
};

type CatalogAction =
    | { type: "searchTyped"; text: string }
    | { type: "categoryToggled"; category: Category }
    | { type: "levelSet"; level: LevelFilter }
    | { type: "sortChanged"; sort: Sort }
    | { type: "pageChanged"; page: number }
    | { type: "filtersReset" }
    | { type: "resultsLoaded"; totalPages: number };

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
    return typeof value === "string" && (list as readonly string[]).includes(value);
}

function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
    switch (action.type) {
        case "searchTyped":
            if (typeof action.text !== "string" || action.text === state.search) return state;
            return { ...state, search: action.text, page: 1 };
        case "categoryToggled": {
            const category = action.category;
            if (!isOneOf(CATEGORIES, category)) return state;
            const categories = state.categories.includes(category)
                ? state.categories.filter((c) => c !== category)
                : [...state.categories, category];
            return { ...state, categories, page: 1 };
        }
        case "levelSet":
            if (!isOneOf(LEVELS, action.level) || action.level === state.level) return state;
            return { ...state, level: action.level, page: 1 };
        case "sortChanged":
            if (!isOneOf(SORTS, action.sort) || action.sort === state.sort) return state;
            return { ...state, sort: action.sort, page: 1 };
        case "pageChanged": {
            const page = action.page;
            if (page < 1 || page > state.totalPages || page === state.page) return state;
            return { ...state, page };
        }
        case "filtersReset":
            if (state.search === "" && state.categories.length === 0 && state.level === "all" && state.page === 1) return state;
            return { ...state, search: "", categories: [], level: "all", page: 1 };
        case "resultsLoaded": {
            if (!Number.isInteger(action.totalPages) || action.totalPages < 0) return state;
            const totalPages = Math.max(1, action.totalPages);
            const page = Math.min(state.page, totalPages);
            if (totalPages === state.totalPages && page === state.page) return state;
            return { ...state, totalPages, page };
        }
        default:
            return state;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "state": CatalogState, "actions": [...], "summary"?: true }. The actions come from the UI,
// from the URL and from sessions saved by older versions of the app, so some are not valid.
// Each line: the action, then the state the reducer returned, marked [same object] when it returned
// the state it received and [previous state mutated] when that state was changed.
// With "summary": true only the final state and the two counts are printed.
type Test = { state: CatalogState; actions: CatalogAction[]; summary?: boolean };

function show(s: CatalogState): string {
    return `search=${JSON.stringify(s.search)} categories=[${s.categories.join(",")}] level=${s.level} sort=${s.sort} page=${s.page}/${s.totalPages}`;
}

const test: Test = JSON.parse(readFileSync(0, "utf8"));
let state = test.state;
let sameCount = 0;
let mutations = 0;
for (const action of test.actions) {
    const before = JSON.stringify(state);
    const next = catalogReducer(state, action);
    const mutated = JSON.stringify(state) !== before;
    if (next === state) sameCount++;
    if (mutated) mutations++;
    if (!test.summary) {
        console.log(`${JSON.stringify(action)} -> ${show(next)}${next === state ? " [same object]" : ""}${mutated ? " [previous state mutated]" : ""}`);
    }
    state = next;
}
if (test.summary) console.log(`after ${test.actions.length} actions: ${show(state)}; same object ${sameCount}; mutations ${mutations}`);
