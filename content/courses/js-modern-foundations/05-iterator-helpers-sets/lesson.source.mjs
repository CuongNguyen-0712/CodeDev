// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-3-1",
    title: "Iterator helpers & the new Set methods (ES2025)",
    slug: { _type: "slug", current: "iterator-helpers-set-methods-es2025" },
    description:
        "An \"export the first 50 admins\" job crashes with \"JavaScript heap out of memory\", and a permission sync spends seconds in nested includes() loops. Learn iterables, iterators and generators, the lazy iterator helpers (map, filter, take, drop, flatMap, toArray ...), the new Set methods (union, intersection, difference ...), and when a Set or Map beats an array or an object.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer, B2B admin console (Node 24)",
        problem:
            "A support agent clicks \"Export first 50 admins\" for the largest tenant (2 million users) and the export worker restarts with \"FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\". Every retry crashes it again, and the other exports queued behind it fail too. The same week, the nightly role sync takes 40 minutes instead of 2, and the security team finds audit entries that say \"granted billing:refund\" twice for the same change.",
    },

    content: [
        h2("1. The incident: two loops that do far too much"),
        p("Both problems live in the same service. The export reads users from a database cursor exposed as a generator, then picks the first 50 admins:"),
        code("javascript", `
// export-admins.js
function* streamUsers(tenantId) {
    // Reads the users table in batches of 1,000 rows and yields them one by one.
    for (const batch of db.cursor("SELECT * FROM users WHERE tenant_id = $1", [tenantId])) {
        yield* batch;
    }
}

export function firstAdmins(tenantId, limit = 50) {
    const users = [...streamUsers(tenantId)];          // "make it an array so we can filter it"
    return users.filter((u) => u.role === "admin").slice(0, limit);
}`, "export-admins.js"),
        p("The role sync compares the permissions of every role before and after an import, and writes an audit entry for each change:"),
        code("javascript", `
// role-sync.js
function auditRoleChange(role, before, after) {
    const granted = after.filter((p) => !before.includes(p));
    const revoked = before.filter((p) => !after.includes(p));
    for (const p of granted) audit.log(role, "granted", p);
    for (const p of revoked) audit.log(role, "revoked", p);
}`, "role-sync.js"),
        p("Both functions are short, readable and correct on a test tenant with 20 users and 10 permissions per role. Both break on real data, for two different reasons: the first does work nobody asked for, and the second uses a data structure that makes every lookup slow."),

        h2("2. Reproduce it on your laptop"),
        p("You do not need a database to see the first problem. A generator that counts how many users it hands out is enough:"),
        code("javascript", `
let pulled = 0;
function* fakeUsers(count) {
    for (let id = 1; id <= count; id++) {
        pulled++;
        yield { id, role: id % 7 === 0 ? "admin" : "member", name: "user-" + id };
    }
}

const users = [...fakeUsers(2_000_000)];
const admins = users.filter((u) => u.role === "admin").slice(0, 50);
console.log(admins.length, "admins,", pulled, "users pulled");
console.log(Math.round(process.memoryUsage().heapUsed / 1e6), "MB of heap");
// -> 50 admins, 2000000 users pulled
// -> a few hundred MB of heap for 50 results`, "repro-export.mjs"),
        p("To show 50 admins the code read 2,000,000 rows, kept all of them alive at the same time, and then built a second array with every admin (about 285,000). Real rows are much bigger than this fake object, so in a container with a 512 MB limit the process dies before `slice` ever runs."),
        p("The second problem is about counting comparisons. `after.filter(p => !before.includes(p))` calls `includes` once per item of `after`, and every `includes` walks `before` from the start. With 4,000 permissions on each side that is up to 16,000,000 string comparisons for one role, and the sync does it for hundreds of roles. Duplicates in the imported arrays are copied straight into the result, which is why the audit says \"granted\" twice."),
        callout("info", "Big-O in one sentence",
            "Array.prototype.includes is O(n): it looks at elements one by one. Set.prototype.has is O(1) on average: it jumps straight to the right bucket. A loop of includes over another array is O(n * m); the same loop with a Set is O(n + m)."),

        h2("3. Iterables, iterators and generators"),
        p("`for...of`, spread (`...`), `Array.from` and destructuring all speak the same small protocol:"),
        bullets([
            "An **iterable** is any object with a `[Symbol.iterator]()` method: arrays, strings, Sets, Maps, generator objects.",
            "Calling that method returns an **iterator**: an object with a `next()` method that returns `{ value, done }`.",
            "The consumer **pulls**: nothing is produced until somebody calls `next()`. When the consumer stops early (`break`, `return`, an exception), `for...of` calls the iterator's `return()` method so it can clean up.",
        ]),
        code("javascript", `
const it = ["a", "b"][Symbol.iterator]();
it.next(); // { value: "a", done: false }
it.next(); // { value: "b", done: false }
it.next(); // { value: undefined, done: true }`),
        p("A **generator function** (`function*`) is the easiest way to write an iterator. Its body runs only when `next()` is called, pauses at every `yield`, and resumes exactly where it left off on the next call:"),
        code("javascript", `
function* countdown(from) {
    try {
        for (let n = from; n > 0; n--) {
            console.log("producing", n);
            yield n;
        }
    } finally {
        console.log("cleanup");          // runs when finished OR when the consumer stops early
    }
}

for (const n of countdown(1_000_000)) {
    if (n === 999_998) break;
}
// producing 1000000, producing 999999, producing 999998, cleanup`, "generators.mjs"),
        p("Only three values were produced, although the generator could produce a million. That is **laziness**: work happens one value at a time, on demand. The incident threw it away on the very first line by spreading the generator into an array, which pulls every value immediately."),

        h2("4. Iterator helpers: array-style methods that stay lazy"),
        p("Until recently, the only way to `filter` or `map` an iterator was to turn it into an array first - exactly what caused the crash. ES2025 added **iterator helpers** to `Iterator.prototype`, so every built-in iterator (generator objects, `array.values()`, `map.entries()`, `set.values()` ...) has them. They are available in Node 22+ and all current browsers."),
        h3("Lazy helpers: return a new iterator, do no work yet"),
        bullets([
            "`map(fn)` and `filter(fn)`: like the array versions, one value at a time.",
            "`take(n)`: yields at most `n` values, then closes the source with `return()` without pulling one more.",
            "`drop(n)`: skips the first `n` values (useful for paging: `drop(100).take(50)`).",
            "`flatMap(fn)`: `fn` returns an iterator or iterable per value, and its values are yielded in turn.",
        ]),
        h3("Consuming helpers: pull values and return a result"),
        bullets([
            "`toArray()`: collects everything that is left into an array. Put it **last**, after `take`.",
            "`reduce(fn, initial)` and `forEach(fn)`: like the array versions.",
            "`some(fn)`, `every(fn)` and `find(fn)`: stop at the first value that decides the answer, and close the source.",
        ]),
        code("javascript", `
pulled = 0;
const firstAdmins = fakeUsers(2_000_000)
    .filter((u) => u.role === "admin")
    .take(50)
    .toArray();
console.log(firstAdmins.length, "admins,", pulled, "users pulled");
// -> 50 admins, 350 users pulled

// Arrays have no take(), but array.values() is an iterator:
[10, 20, 30, 40].values().drop(1).take(2).toArray();   // [20, 30]

// Iterator.from wraps any iterable or iterator-like object, so helpers always work:
Iterator.from(new Set(["a", "b"])).map((s) => s.toUpperCase()).toArray();   // ["A", "B"]`, "iterator-helpers.mjs"),
        image("eager-vs-lazy-pipeline", {
            alt: "Two pipelines side by side. Eager: users generator, spread into a 2,000,000-element array, filter into a second array, slice to 50 - the heap limit is reached at the spread. Lazy: toArray pulls from take(50), which pulls from filter, which pulls from the generator one row at a time; after 50 matches take closes the chain and only 350 rows were read.",
            caption: "Array methods finish the whole list before the next step starts. Iterator helpers pass one value through the whole chain, and take() stops the source as soon as it has enough.",
        }),
        callout("warning", "An iterator is used up once",
            "Arrays can be looped over again and again. An iterator cannot: after toArray() it is empty, and a second toArray() returns []. If you need the data twice, keep the array (or call the generator function again to get a fresh iterator)."),

        h2("5. Sets for membership, and the new Set methods"),
        p("A `Set` stores each value once and answers `has(value)` in constant time on average. Building one from an array is one line, and it removes duplicates for free:"),
        code("javascript", `
const roles = new Set(["editor", "viewer", "editor"]);
roles.size;            // 2
roles.has("editor");   // true - no loop over the elements`),
        p("ES2025 adds the set operations you would otherwise write by hand with `filter` and `has`. Each one returns a **new** Set and never changes the original. The Set it is called on and the argument play different roles, so the order matters for `difference`:"),
        code("javascript", `
const free = new Set(["export", "search", "comments"]);
const pro  = new Set(["search", "comments", "sso", "audit-log"]);

free.union(pro);               // Set { "export", "search", "comments", "sso", "audit-log" }
free.intersection(pro);        // Set { "search", "comments" }      - in both
pro.difference(free);          // Set { "sso", "audit-log" }        - in pro, not in free
free.difference(pro);          // Set { "export" }                  - in free, not in pro
free.symmetricDifference(pro); // Set { "export", "sso", "audit-log" } - in exactly one

new Set(["search"]).isSubsetOf(pro);     // true  - every element is in pro
pro.isSupersetOf(new Set(["sso"]));      // true  - pro contains every element of the argument
free.isDisjointFrom(new Set(["sso"]));   // true  - no element in common`, "set-methods.mjs"),
        p("Permission checks become a single readable line, and they cost O(size of the required set) instead of a nested loop:"),
        code("javascript", `
function canAccess(userPermissions, route) {
    // userPermissions is a Set built once per request, route.required is a Set built at startup.
    return route.required.isSubsetOf(userPermissions);
}`, "can-access.mjs"),
        callout("warning", "The argument must be set-like, not an array",
            "new Set([1]).union([2]) throws \"TypeError: The .size property is NaN\". The argument needs size, has() and keys() - a Set or a Map works, an array does not. Wrap it: a.union(new Set(array))."),

        h3("Set and Map vs arrays and objects"),
        bullets([
            "**\"Is X in this collection?\"** asked more than a handful of times: use a `Set`, not `array.includes`.",
            "**Lookup by key** (id to user, permission to description): use a `Map`. Keys can be any type (numbers stay numbers), insertion order is kept, `size` is a property, and no inherited key such as `\"constructor\"` or `\"__proto__\"` can surprise you.",
            "**Plain objects** are still right for records with known field names (`{ id, name, role }`) and for JSON.",
            "**Arrays** are still right for ordered lists you index, sort or render.",
            "**Order from set operations**: the result follows insertion order, but which side drives `intersection` is an implementation detail. Sort the result if the output order matters, for example in an audit log or a test.",
        ]),

        h2("6. Build it: a permission diff and a lazy export"),
        p("Now fix both halves of the incident. `diffPermissions` turns the before and after arrays into Sets and reports what was granted, revoked and left unchanged, without duplicates. `firstMatching` returns the first `n` matching users from an iterator without reading one user more than it needs."),
        p("The harness hands `firstMatching` a generator of up to 2,000,000 users that counts every user it gives out and records whether its `finally` block ran. Reading the whole source - or even one user too many - fails the test."),
        challenge("chal_coding_jsf_311", "Build two Sets and ask each question with one Set method; the direction of difference() decides granted vs revoked. For the export, chain filter, take and toArray on the iterator, with take before toArray."),

        h2("7. The fix in production"),
        p("The export no longer spreads anything. It keeps the generator, filters lazily, and stops the database cursor as soon as it has enough rows:"),
        code("javascript", `
export function firstAdmins(tenantId, limit = 50) {
    return streamUsers(tenantId)
        .filter((u) => u.role === "admin")
        .take(limit)        // closes streamUsers -> the cursor's finally block releases the connection
        .toArray();         // at most \`limit\` users in memory
}`, "export-admins.js"),
        p("The role sync builds two Sets per role, so each comparison is a hash lookup instead of a scan, and duplicates disappear before anything is written to the audit log. On the largest tenant the export now reads a few hundred rows instead of two million, and the sync is back to about two minutes."),

        h2("8. Pitfalls"),
        bullets([
            "**`toArray()` too early.** `users.toArray().filter(...).slice(0, 50)` is the incident again. Every lazy step must come before the first consuming step.",
            "**Spreading an infinite or huge iterator.** `[...gen()]`, `Array.from(gen())` and `Math.max(...gen())` read everything. On an infinite generator they never return.",
            "**Reusing an iterator.** A second loop over the same iterator object continues where the first stopped, or gets nothing at all.",
            "**Checking the count after pulling.** A hand-written loop that asks \"do I have enough?\" at the top of the next iteration has already pulled one extra value - which may be one extra page request or database read.",
            "**Passing an array to a Set method.** `set.union(array)` throws; wrap the array in `new Set(...)`.",
            "**Mixing up difference directions.** `after.difference(before)` is what was granted, `before.difference(after)` is what was revoked; `symmetricDifference` is both together.",
            "**Expecting async support.** These helpers are for synchronous iterators. An async generator (`async function*`) needs `for await...of` or your own async helpers.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Large or unbounded sources stay iterators; nothing spreads them into an array \"to be able to filter\".",
            "Pipelines put `take`, `drop`, `filter` and `map` before `toArray`, `reduce` or `forEach`.",
            "Early exits (`take`, `find`, `some`, `break`) close the source, and generators that hold resources release them in `finally`.",
            "Membership checks that run more than a few times use a `Set`, built once; lookups by key use a `Map`.",
            "Set comparisons use `union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`, `isSupersetOf` and `isDisjointFrom`, with Sets (not arrays) as arguments.",
            "Output built from Sets is sorted before it is shown, logged or compared in a test.",
        ]),
    ],
});
