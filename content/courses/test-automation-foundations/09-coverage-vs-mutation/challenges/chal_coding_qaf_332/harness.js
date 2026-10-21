// Harness: Kill the surviving mutants (mutation testing by hand)
// Runs the learner's shippingFeeSuite(shippingFee, assert) against the correct shippingFee or one mutant.
//   input: { mutant: "correct" | "m1".."m7" | "hidden" | "score" }
//   output for "correct": "passed" | "no assertions ran" | "failed: <first error message>"
//   output for a mutant:  "killed" (the suite threw) | "survived" (the suite stayed green)
//   output for "score":   "mutation score: K killed / (9 mutants - 1 equivalent) = P%"
async function __harness(input) {
    // m1..m7 are the report's mutants, m8 the equivalent one, "hidden" is not in the report.
    function build(m) {
        return function shippingFee(subtotalCents, weightGrams, isMember) {
            if (!Number.isInteger(subtotalCents) || subtotalCents < 0) throw new RangeError("bad subtotal");
            if (!Number.isInteger(weightGrams) || (m === "hidden" ? weightGrams < 0 : weightGrams <= 0)) {
                throw new RangeError("bad weight");
            }
            const enough = m === "m1" ? subtotalCents > 10000 : subtotalCents >= 10000;
            const light = m === "m3" ? weightGrams < 20000 : weightGrams <= 20000;
            if (m === "m2" ? enough || light : enough && light) return 0;
            let fee = 499;
            if (m === "m8" ? weightGrams >= 2000 : weightGrams > 2000) {
                const extra = 150 * (m === "m5" ? Math.floor : Math.ceil)((weightGrams - 2000) / 1000);
                fee = m === "m4" ? fee - extra : fee + extra;
            }
            if (m === "m6" ? isMember || fee > 499 : isMember && fee > 499) fee = fee - 100;
            return m === "m7" ? 0 : fee;
        };
    }

    // Runs the suite once; returns { threw, error, assertions }.
    async function runSuite(m) {
        const impl = build(m);
        // Same wrapper for every implementation, so the suite cannot tell them apart by source text.
        const shippingFee = (subtotalCents, weightGrams, isMember) => impl(subtotalCents, weightGrams, isMember);
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
            await shippingFeeSuite(shippingFee, assert);
            return { threw: false, assertions };
        } catch (error) {
            return { threw: true, error, assertions };
        }
    }

    const counted = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "hidden"];

    if (input.mutant === "correct") {
        const run = await runSuite("correct");
        if (run.threw) return `failed: ${run.error && run.error.message}`;
        return run.assertions === 0 ? "no assertions ran" : "passed";
    }
    if (input.mutant === "score") {
        const base = await runSuite("correct");
        if (base.threw || base.assertions === 0) return "suite does not pass on the correct shippingFee";
        let killed = 0;
        for (const m of counted) if ((await runSuite(m)).threw) killed++;
        const score = Math.round((killed / counted.length) * 100);
        return `mutation score: ${killed} killed / (${counted.length + 1} mutants - 1 equivalent) = ${score}%`;
    }
    if (!counted.includes(input.mutant)) throw new Error(`unknown mutant ${input.mutant}`);
    return (await runSuite(input.mutant)).threw ? "killed" : "survived";
}
