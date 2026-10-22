import { readFileSync } from "node:fs";

// Chợ Sớm daily settlement: one line per payment for the accounting export, then the totals.
// A payment is one of four methods; the "method" property tells them apart.
//
// fee(p), in đồng, rounded to the nearest đồng with Math.round:
//   card  2% of the amount; 3% when the order is paid in installments (installments > 1)
//   cod   15000 when the courier collected the cash, 0 when not
//   bank  0
//   momo  1.5% of the amount, but at least 1000
//
// describe(p):
//   card  "card ****<last4>", plus " in <installments> installments" when installments > 1
//   cod   "cash on delivery", plus " (not collected)" when collected is false
//   bank  "bank transfer <reference>"
//   momo  "MoMo <phone>" with the phone masked: the first 3 and the last 3 digits, "****" between
//         ("0912345678" -> "091****678")
//
// isSettled(p): false for cash on delivery that was not collected, true otherwise.
//
// Write the three functions with a switch on p.method, and make each switch exhaustive with
// assertNever: when a fifth method is added to Payment, they must stop compiling.
// Do not change the Payment type, assertNever or the test runner.

type Payment =
    | { method: "card"; amount: number; last4: string; installments: number }
    | { method: "cod"; amount: number; collected: boolean }
    | { method: "bank"; amount: number; reference: string }
    | { method: "momo"; amount: number; phone: string };

function assertNever(value: never): never {
    throw new Error(`unexpected payment: ${JSON.stringify(value)}`);
}

function fee(p: Payment): number {
    switch (p.method) {
        case "card":
            return Math.round((p.amount * (p.installments > 1 ? 3 : 2)) / 100);
        case "cod":
            return p.collected ? 15000 : 0;
        case "bank":
            return 0;
        default:
            return 0; // momo falls through here
    }
}

function describe(p: Payment): string {
    switch (p.method) {
        case "card":
            return `card ****${p.last4}` + (p.installments > 1 ? ` in ${p.installments} installments` : "");
        case "cod":
            return "cash on delivery" + (p.collected ? "" : " (not collected)");
        case "bank":
            return `bank transfer ${p.reference}`;
        case "momo":
            return `MoMo ${p.phone.slice(0, 3)}****${p.phone.slice(-3)}`;
        default:
            return assertNever(p);
    }
}

function isSettled(p: Payment): boolean {
    switch (p.method) {
        case "cod":
            return p.collected;
        case "card":
        case "bank":
        case "momo":
            return true;
        default:
            return assertNever(p);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
const payments: Payment[] = JSON.parse(readFileSync(0, "utf8"));
let net = 0;
let fees = 0;
let pending = 0;
for (const p of payments) {
    if (!isSettled(p)) {
        pending++;
        console.log(`${describe(p)}: ${p.amount} pending`);
        continue;
    }
    const f = fee(p);
    fees += f;
    net += p.amount - f;
    console.log(`${describe(p)}: ${p.amount} - fee ${f} = ${p.amount - f}`);
}
console.log(`settled ${net}, fees ${fees}, pending ${pending}`);
