// Harness: input = { orders: [{ createdAt, amount }], timeZone }
// Output: whatever groupByLocalDay returns (compared as JSON, key order ignored).
async function __harness(input) {
    return groupByLocalDay(input.orders, input.timeZone);
}
