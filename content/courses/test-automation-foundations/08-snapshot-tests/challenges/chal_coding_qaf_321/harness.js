// Harness: normalizeForSnapshot - deterministic snapshots
//   input { check: "value", value }    -> JSON.stringify(normalizeForSnapshot(value))
//   input { check: "mutation", value } -> "input unchanged, new copy" | what went wrong
//   input { check: "incident" }        -> { sameInvoiceTwoRuns, missingVatLine }: "identical" | "differs"
//   a thrown error                     -> "failed: <message>"
async function __harness(rawInput) {
    // A private copy: a normalizer that mutates its argument must not change the test case itself.
    const input = JSON.parse(JSON.stringify(rawInput));

    // Every object and array reachable from a value.
    function containers(v, seen = new Set()) {
        if (v !== null && typeof v === "object" && !seen.has(v)) {
            seen.add(v);
            for (const child of Object.values(v)) containers(child, seen);
        }
        return seen;
    }

    // One invoice for a VN customer, built with the ids, timestamp and key order of one "run".
    function invoice({ ids, createdAt, reversed, vat = true }) {
        const line1 = { id: ids[1], sku: "MUG-01", qty: 2, amountCents: 2500 };
        const line2 = { id: ids[2], sku: "TEE-02", qty: 1, amountCents: 1500 };
        const fields = [
            ["invoiceId", ids[0]],
            ["createdAt", createdAt],
            ["customer", reversed ? { country: "VN", name: "Nguyen An" } : { name: "Nguyen An", country: "VN" }],
            ["lines", [line1, line2]],
            ["discounts", [{ appliesTo: ids[2], code: "TEE20", amountCents: 300 }]],
            ["taxes", vat ? [{ id: ids[3], name: "VAT 10%", amountCents: 370 }] : []],
            ["totalCents", vat ? 4070 : 3700],
        ];
        return Object.fromEntries(reversed ? fields.reverse() : fields);
    }

    try {
        if (input.check === "value") {
            return JSON.stringify(normalizeForSnapshot(input.value));
        }

        if (input.check === "mutation") {
            const before = JSON.stringify(input.value);
            const inputObjects = containers(input.value);
            const result = normalizeForSnapshot(input.value);
            if (JSON.stringify(input.value) !== before) return "mutated the input";
            if (result === undefined || result === null) return `returned ${result}`;
            for (const obj of containers(result)) {
                if (inputObjects.has(obj)) return "the result shares an object or array with the input";
            }
            return "input unchanged, new copy";
        }

        if (input.check === "incident") {
            const runA = invoice({
                ids: ["0b6e5f6a-58f1-4c1e-9d1a-6f2a1c9e7b10", "3c2d1e0f-4a5b-4c6d-8e7f-901a2b3c4d5e",
                      "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "f0e1d2c3-b4a5-4968-8776-5a4b3c2d1e0f"],
                createdAt: "2026-10-21T09:19:24.446Z",
                reversed: false,
            });
            const runB = invoice({
                ids: ["c6c6cbc5-d8bd-4094-b7af-480e08824c33", "7062951c-e448-4db4-bac7-4bbc64d274bf",
                      "99d80244-1afd-4533-b456-30c5a54f2154", "7cee0c96-fd6f-4d82-bff0-05bb693ec999"],
                createdAt: "2026-10-21T09:19:27.075Z",
                reversed: true,
            });
            const noVat = invoice({
                ids: ["67ec3b54-247e-43ca-8009-77637a1dfa15", "ccbc3fb1-fa85-42ca-9fbd-caa2064da23f",
                      "1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5", "5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c"],
                createdAt: "2026-10-22T02:00:00.000Z",
                reversed: false,
                vat: false,
            });
            const a = JSON.stringify(normalizeForSnapshot(runA));
            const b = JSON.stringify(normalizeForSnapshot(runB));
            const c = JSON.stringify(normalizeForSnapshot(noVat));
            if (a === undefined) return "failed: returned undefined";
            return {
                sameInvoiceTwoRuns: a === b ? "identical" : "differs",
                missingVatLine: a === c ? "identical" : "differs",
            };
        }

        throw new Error(`unknown check ${input.check}`);
    } catch (error) {
        return `failed: ${error && error.message}`;
    }
}
