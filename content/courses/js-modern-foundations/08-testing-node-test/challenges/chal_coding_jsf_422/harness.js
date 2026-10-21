// Harness: Write a test suite that catches real bugs (mutation testing)
// Runs the learner's discountSuite(applyDiscount, assert) against one implementation.
//   input: { impl: "correct" | "<bug name>" }
//   output for "correct": "passed" | "no assertions ran" | "failed: <first error message>"
//   output for a bug:     "bug caught" (the suite threw) | "bug survived" (the suite stayed green)
async function __harness(input) {
    const THRESHOLD = 5000;

    function checkInput(subtotalCents, percent, { lower = true, upper = true } = {}) {
        if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
            throw new RangeError(`subtotalCents must be a whole number >= 0, got ${subtotalCents}`);
        }
        if (!Number.isInteger(percent) || (lower && percent < 0) || (upper && percent > 100)) {
            throw new RangeError(`percent must be a whole number from 0 to 100, got ${percent}`);
        }
    }
    const price = (subtotalCents, percent) => subtotalCents - Math.round((subtotalCents * percent) / 100);

    const implementations = {
        correct(subtotalCents, percent = 10) {
            checkInput(subtotalCents, percent);
            if (subtotalCents < THRESHOLD) return subtotalCents;
            return price(subtotalCents, percent);
        },
        // Returns the discount amount instead of the price after discount.
        returnsDiscount(subtotalCents, percent = 10) {
            checkInput(subtotalCents, percent);
            if (subtotalCents < THRESHOLD) return subtotalCents;
            return Math.round((subtotalCents * percent) / 100);
        },
        // Threshold written as > instead of >=: a cart of exactly 5000 gets nothing.
        strictThreshold(subtotalCents, percent = 10) {
            checkInput(subtotalCents, percent);
            if (subtotalCents <= THRESHOLD) return subtotalCents;
            return price(subtotalCents, percent);
        },
        // `percent || 10`: an explicit 0% falls back to the default 10%.
        zeroFallsBack(subtotalCents, percent) {
            const pct = percent || 10;
            checkInput(subtotalCents, pct);
            if (subtotalCents < THRESHOLD) return subtotalCents;
            return price(subtotalCents, pct);
        },
        // Forgot the upper bound: 150% returns a negative price.
        noUpperBound(subtotalCents, percent = 10) {
            checkInput(subtotalCents, percent, { upper: false });
            if (subtotalCents < THRESHOLD) return subtotalCents;
            return price(subtotalCents, percent);
        },
        // Forgot the lower bound: a negative percent raises the price.
        noLowerBound(subtotalCents, percent = 10) {
            checkInput(subtotalCents, percent, { lower: false });
            if (subtotalCents < THRESHOLD) return subtotalCents;
            return price(subtotalCents, percent);
        },
    };

    const impl = implementations[input.impl];
    if (!impl) throw new Error(`unknown implementation ${input.impl}`);

    let assertions = 0;
    const fail = (message, fallback) => { throw new Error(message || fallback); };
    const assert = {
        ok(value, message) {
            assertions++;
            if (!value) fail(message, `expected a truthy value, got ${String(value)}`);
        },
        strictEqual(actual, expected, message) {
            assertions++;
            if (!Object.is(actual, expected)) fail(message, `expected ${String(expected)}, got ${String(actual)}`);
        },
        throws(fn, ErrorClass, message) {
            assertions++;
            let threw = false;
            let error;
            try { fn(); } catch (err) { threw = true; error = err; }
            if (!threw) fail(message, "missing expected exception");
            if (ErrorClass && !(error instanceof ErrorClass)) {
                fail(message, `expected ${ErrorClass.name}, got ${error && error.name}`);
            }
        },
    };

    try {
        await discountSuite(impl, assert);
    } catch (error) {
        if (input.impl !== "correct") return "bug caught";
        return `failed: ${error && error.message}`;
    }
    if (input.impl !== "correct") return "bug survived";
    return assertions === 0 ? "no assertions ran" : "passed";
}
