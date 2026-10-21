// Harness: totals carts with the learner's checkoutTotal(lines).
// input.carts is a list of carts; each cart is a list of { price, qty } lines.
// Output, one entry per cart: { cents, display } when the cart is valid, "rejected" when
// checkoutTotal throws.
async function __harness(input) {
    return input.carts.map((lines) => {
        try {
            const { cents, display } = checkoutTotal(lines);
            return { cents, display };
        } catch {
            return "rejected";
        }
    });
}
