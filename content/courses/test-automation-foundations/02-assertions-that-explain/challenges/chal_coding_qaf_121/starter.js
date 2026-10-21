/**
 * Write a domain assertion that explains every difference between two orders.
 *
 * assertSameOrder(actual, expected)
 *   - Returns undefined when the two orders are deep-equal.
 *   - Otherwise throws an Error whose message is "order mismatch:" followed by one line per
 *     difference, each on its own line ("\n" between lines, no trailing newline):
 *         "  <path>: expected <value>, got <value>"      (two spaces at the start)
 *
 * Values: both arguments are plain objects. Inside them you will only find plain objects,
 * arrays, strings, numbers, booleans and null (no undefined, Dates, Maps or functions).
 *
 * How to compare (walk both values together, starting at the top-level object):
 *   - Both plain objects (not null, not arrays): visit the keys of `expected` in their order,
 *     then the keys that exist only in `actual`, in their order. Key order does NOT make two
 *     objects different: { a: 1, b: 2 } and { b: 2, a: 1 } are equal.
 *   - Both arrays: visit indexes 0, 1, 2 ... up to the longer of the two lengths.
 *   - Anything else (two primitives, or two values of different kinds such as an object and
 *     null, or an array and an object): it is ONE difference when they are not strictly
 *     equal (===). So 2 and "2" differ. Do not look inside them.
 *   - A key or index that is missing on one side has the value undefined on that side.
 *
 * Paths: an object key is written as `.key` and an array index as `[i]`; a top-level key has
 * no leading dot. Examples: `status`, `lines[1].qty`, `customer.address.city`, `lines[2]`.
 *
 * Values in the message: JSON.stringify(value), or the word undefined when the value is missing.
 *   "paid" -> "paid" (with quotes)   2 -> 2   null -> null   { sku: "A" } -> {"sku":"A"}
 *
 * Example:
 *   assertSameOrder(
 *     { status: "paid", lines: [{ sku: "MUG-01", qty: 2 }, { sku: "TEE-02", qty: 2 }] },
 *     { status: "paid", lines: [{ sku: "MUG-01", qty: 2 }, { sku: "TEE-02", qty: 3 }], coupon: "AUTUMN10" },
 *   );
 *   // throws an Error with the message:
 *   // order mismatch:
 *   //   lines[1].qty: expected 3, got 2
 *   //   coupon: expected "AUTUMN10", got undefined
 *
 * @param {object} actual    the order the code under test produced
 * @param {object} expected  the order the test expects
 */
function assertSameOrder(actual, expected) {
  // The check from the 02:00 incident: one boolean, so the failure cannot say what differed.
  const same =
    actual.total === expected.total &&
    actual.status === expected.status &&
    actual.lines.length === expected.lines.length;
  if (!same) throw new Error("The expression evaluated to a falsy value");

  // TODO: compare every field (nested objects and arrays too) and report each difference.
}
