// Harness: Set methods & lazy iterator helpers
// Modes:
//   "diff"  -> diffPermissions(before, after); each returned list is copied with Array.from and
//              sorted, so the order you return does not matter (duplicates still count).
//              Output: { granted, revoked, unchanged }
//   "first" -> firstMatching(users(), isAdmin, n) over a generator of `count` users where every
//              `every`-th user is an admin. The generator counts every user it hands out and
//              records whether its finally block ran (the source was closed or used up).
//              Output: { ids, pulled, closed }
async function __harness(input) {
    if (input.mode === "diff") {
        const result = diffPermissions(input.before.slice(), input.after.slice());
        if (!result || typeof result !== "object") throw new Error("diffPermissions must return { granted, revoked, unchanged }");
        const list = (value, key) => {
            if (value == null || typeof value[Symbol.iterator] !== "function") throw new Error(`${key} must be an array or another iterable`);
            return Array.from(value).sort();
        };
        return {
            granted: list(result.granted, "granted"),
            revoked: list(result.revoked, "revoked"),
            unchanged: list(result.unchanged, "unchanged"),
        };
    }

    if (input.mode === "first") {
        const LIMIT = 10000;
        let pulled = 0;
        let closed = false;
        function* users(count) {
            try {
                for (let id = 1; id <= count; id++) {
                    pulled += 1;
                    if (pulled > LIMIT) throw new Error(`pulled more than ${LIMIT} users - the export is reading the whole table`);
                    yield { id, role: id % input.every === 0 ? "admin" : "member" };
                }
            } finally {
                closed = true;
            }
        }
        const isAdmin = (user) => user.role === "admin";
        const result = firstMatching(users(input.count), isAdmin, input.n);
        if (result == null || typeof result[Symbol.iterator] !== "function") throw new Error("firstMatching must return an array");
        const ids = Array.from(result, (user) => user.id);
        return { ids, pulled, closed };
    }

    throw new Error(`unknown mode ${input.mode}`);
}
