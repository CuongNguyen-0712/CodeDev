import { readFileSync } from "node:fs";

// Chợ Sớm delivery labels, printed at the Long Biên packing hub and stuck on every bag.
//
// formatLabel(order) returns the lines of one label, in this order:
//
//   1. "<id> | BEFORE 08:00" for the slot "before-8", "<id> | BEFORE 10:00" for "before-10",
//      followed by " | FRAGILE" when fragile is true.
//   2. "To: <name>, <phone>", followed by " / <altPhone>" when there is an altPhone
//      (an empty altPhone counts as no altPhone).
//   3. The parts of the street line that exist, joined with ", ", in this order:
//      "Apt <apartment>", the floor ("Ground floor" for floor 0, "Floor <n>" otherwise),
//      the building, and the street (always there).
//   4. "<ward>, <district>, <city>".
//   5. "Collect: <amount> đ" when codAmount is more than 0, with a dot between every group of three
//      digits (245000 -> "245.000", 1250000 -> "1.250.000"); otherwise "Paid online".
//   6. "Note: <note>" with the note trimmed - only when the trimmed note is not empty.
//
// Optional properties are missing from the JSON when they have no value. Write formatVnd and
// formatLabel; do not change the interfaces or the test runner.

interface Address {
    street: string;
    ward: string;
    district: string;
    city: string;
    building?: string;
    floor?: number; // 0 is the ground floor
    apartment?: string;
}

interface Recipient {
    name: string;
    phone: string;
    altPhone?: string;
}

interface DeliveryOrder {
    readonly id: string;
    slot: "before-8" | "before-10";
    recipient: Recipient;
    address: Address;
    fragile?: boolean;
    codAmount?: number; // cash to collect at the door, in đồng
    note?: string;
}

// 245000 -> "245.000"
function formatVnd(amount: number): string {
    const digits = String(amount);
    const groups: string[] = [];
    for (let end = digits.length; end > 0; end -= 3) {
        groups.unshift(digits.slice(Math.max(0, end - 3), end));
    }
    return groups.join(".");
}

function formatLabel(order: DeliveryOrder): string[] {
    const { recipient, address } = order;
    const head = `${order.id} | ${order.slot === "before-8" ? "BEFORE 08:00" : "BEFORE 10:00"}`;
    const lines = [order.fragile === true ? `${head} | FRAGILE` : head];

    lines.push(`To: ${recipient.name}, ${recipient.phone}` + (recipient.altPhone ? ` / ${recipient.altPhone}` : ""));

    const street: string[] = [];
    if (address.apartment !== undefined) street.push(`Apt ${address.apartment}`);
    if (address.floor !== undefined) street.push(address.floor === 0 ? "Ground floor" : `Floor ${address.floor}`);
    if (address.building !== undefined) street.push(address.building);
    street.push(address.street);
    lines.push(street.join(", "));
    lines.push(`${address.ward}, ${address.district}, ${address.city}`);

    const cod = order.codAmount ?? 0;
    lines.push(cod > 0 ? `Collect: ${formatVnd(cod)} đ` : "Paid online");

    const note = order.note?.trim() ?? "";
    if (note !== "") lines.push(`Note: ${note}`);
    return lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const orders: DeliveryOrder[] = JSON.parse(readFileSync(0, "utf8"));
console.log(orders.map((order) => formatLabel(order).join("\n")).join("\n---\n"));
