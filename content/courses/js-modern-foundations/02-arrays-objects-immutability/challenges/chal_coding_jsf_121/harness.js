// Harness: calls summarizeOrders(input.orders) and checks that the input was not changed.
// The orders are snapshotted as JSON before the call and compared after it, so sorting the
// array in place, adding a property to an order or editing an item all show up as
// inputUnchanged: false.
// Output: { result, inputUnchanged }
async function __harness(input) {
    const before = JSON.stringify(input.orders);
    const result = summarizeOrders(input.orders);
    return { result, inputUnchanged: JSON.stringify(input.orders) === before };
}
