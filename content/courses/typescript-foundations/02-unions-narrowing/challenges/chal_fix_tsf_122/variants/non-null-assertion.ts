import { readFileSync } from "node:fs";

// Chợ Sớm order tracking: one status line per order, shown on the "Đơn hàng của bạn" page.
//
// courierId is null until the morning assignment run gives the order a courier. A courier who
// leaves the company is removed from the couriers list, but their orders keep the old courierId.
// etaMinutes is null until the courier's app sends a first position; 0 means the courier is there.
//
// trackingLine must return, for each case:
//   courierId is null                  "<id>: waiting for a courier"
//   courierId not in the couriers list "<id>: courier <courierId> is not available, call 1900 6868"
//   etaMinutes is null                 "<id>: <name> (<phone>) is on the way"
//   etaMinutes is 0                    "<id>: <name> (<phone>) is at your door"
//   otherwise                          "<id>: <name> (<phone>) arrives in <etaMinutes> min"
//
// The bug: the page crashed with "Cannot read properties of undefined (reading 'name')" for every
// order whose courier had left. Under --strict this file does not even compile. Fix trackingLine
// by narrowing, without the ! operator. Do not change the types or the test runner.

type Courier = { id: string; name: string; phone: string };
type Order = { id: string; courierId: string | null; etaMinutes: number | null };

function trackingLine(order: Order, couriers: Courier[]): string {
    if (order.courierId === null) {
        return `${order.id}: waiting for a courier`;
    }
    const courier = couriers.find((c) => c.id === order.courierId);
    const who = `${order.id}: ${courier!.name} (${courier!.phone})`;
    if (order.etaMinutes === null) {
        return `${who} is on the way`;
    }
    if (order.etaMinutes === 0) {
        return `${who} is at your door`;
    }
    return `${who} arrives in ${order.etaMinutes} min`;
}

// ---------------------------------------------------------------- test runner (do not change)
const { couriers, orders }: { couriers: Courier[]; orders: Order[] } = JSON.parse(readFileSync(0, "utf8"));
for (const order of orders) {
    console.log(trackingLine(order, couriers));
}
