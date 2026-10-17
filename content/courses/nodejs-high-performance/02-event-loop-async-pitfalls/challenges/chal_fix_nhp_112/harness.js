// Harness: Fix the settlement total that is always 0
// The fake gateway answers each fee lookup after a few microtask "ticks" (like a
// network round-trip, but deterministic - no real time involved).
// Output: the object settleMerchant resolved to.
async function __harness(input) {
    const ticks = async (n) => {
        for (let i = 0; i < n; i++) await null;
    };

    const fees = input.fees || {};
    const delays = input.delays || {};
    const gateway = {
        async getFee(orderId) {
            await ticks(Number(delays[orderId]) || 3);
            if (!Object.prototype.hasOwnProperty.call(fees, orderId)) {
                throw new Error(`unknown order ${orderId}`);
            }
            return fees[orderId];
        },
    };

    return settleMerchant(
        { merchantId: input.merchantId, orders: input.orders || [] },
        gateway
    );
}
