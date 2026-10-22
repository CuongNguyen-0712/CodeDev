import { readFileSync } from "node:fs";

// Chợ Sớm checkout: what the shopper pays, computed from the checkout form.
//
// Every value in a form arrives as a string. Shoppers type amounts the Vietnamese way, with dots
// between the thousands ("155.000"), or without them ("155000").
//
// toVnd(text) turns one form field into a number of đồng:
//   - spaces around the text are ignored;
//   - an empty field means 0;
//   - valid: digits only ("30000"), or digits in groups of three separated by dots ("1.250.000");
//   - anything else ("30,000", "1.5", "30.00", "-5000", "abc") is invalid: return NaN.
//
// orderTotal(subtotal, shipping, voucher) returns what the shopper pays:
//   - shipping is free when the subtotal (before the voucher) is 300.000 đ or more;
//   - the voucher comes off the subtotal, but never more than the subtotal: shipping is always paid.
//
// Both functions are missing their type annotations, so under --strict this file does not compile yet.
// Annotate the parameters and the return types, then write the bodies.

function toVnd(text: string): number {
    const trimmed = text.trim();
    if (trimmed === "") return 0;
    return parseInt(trimmed.replaceAll(".", ""), 10); // stops at the first character that is not a digit
}

function orderTotal(subtotal: number, shipping: number, voucher: number): number {
    const fee = subtotal >= 300_000 ? 0 : shipping;
    return subtotal - Math.min(voucher, subtotal) + fee;
}

// ---------------------------------------------------------------- test runner (do not change)
const FIELDS = ["subtotal", "shipping", "voucher"] as const;
const form: Record<string, string> = JSON.parse(readFileSync(0, "utf8"));
const amounts: number[] = [];
for (const field of FIELDS) {
    const text = form[field] ?? "";
    const value: number = toVnd(text);
    if (Number.isNaN(value)) {
        console.log(`invalid ${field}: ${JSON.stringify(text)}`);
        process.exit(0);
    }
    amounts.push(value);
}
const [subtotal, shipping, voucher] = amounts;
const total: number = orderTotal(subtotal, shipping, voucher);
console.log(`total: ${total}`);
