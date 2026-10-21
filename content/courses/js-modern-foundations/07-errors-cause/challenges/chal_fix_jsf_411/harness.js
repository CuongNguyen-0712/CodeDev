// Harness: Make the import job's errors explain themselves
// input: { csv: string, saveFails?: { message, code? } }
// The store is a fake: save() records the rows (or throws an Error with the given message/code),
// close() records that it was called.
// Output:
//   { outcome: "returned", value, savedRows, closeCalls }
//   { outcome: "threw", error, savedRows, closeCalls }
// error describes what was thrown: name, message, code, line, errors (AggregateError) and cause,
// followed recursively - or { notAnError: typeof value, value } when something other than an
// Error object was thrown.
async function __harness(input) {
    let savedRows = 0;
    let closeCalls = 0;
    const store = {
        save(rows) {
            if (input.saveFails) {
                const error = new Error(input.saveFails.message);
                if (input.saveFails.code) error.code = input.saveFails.code;
                throw error;
            }
            savedRows += rows.length;
        },
        close() {
            closeCalls += 1;
        },
    };

    try {
        const value = importOrders(input.csv, store);
        return { outcome: "returned", value, savedRows, closeCalls };
    } catch (error) {
        return { outcome: "threw", error: __describeError(error, 0), savedRows, closeCalls };
    }
}

function __describeError(value, depth) {
    if (!(value instanceof Error)) return { notAnError: typeof value, value: String(value) };
    const described = { name: value.name, message: value.message };
    if (value.code !== undefined) described.code = value.code;
    if (typeof value.line === "number") described.line = value.line;
    if (Array.isArray(value.errors)) described.errors = value.errors.map((item) => __describeError(item, depth + 1));
    if (value.cause !== undefined && depth < 5) described.cause = __describeError(value.cause, depth + 1);
    return described;
}
