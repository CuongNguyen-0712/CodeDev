// Harness: Write an order assertion that explains every difference
//   input:  { actual: object, expected: object }  (plain JSON: objects, arrays, strings, numbers, booleans, null)
//   output: "ok"                          assertSameOrder returned without throwing
//           "<error message>"             it threw an Error: its message, compared exactly
//           "threw a non-Error: <value>"  it threw something that is not an Error object
async function __harness(input) {
    // Fresh copies, so a solution that mutates its arguments cannot affect another test.
    const actual = JSON.parse(JSON.stringify(input.actual));
    const expected = JSON.parse(JSON.stringify(input.expected));
    try {
        await assertSameOrder(actual, expected);
    } catch (error) {
        if (error instanceof Error) return error.message;
        return `threw a non-Error: ${String(error)}`;
    }
    return "ok";
}
