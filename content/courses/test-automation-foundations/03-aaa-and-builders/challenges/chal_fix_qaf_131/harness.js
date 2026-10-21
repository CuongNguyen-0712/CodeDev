// Harness: Fix the order builder that leaks data between tests
// input: { scenario: "<name>" } - each scenario uses the builder the way a test file would and
// reports what it observed. Any exception becomes "failed: <message>".
async function __harness(input) {
  if (typeof anOrder !== "function") return "failed: anOrder is not a function";
  if (typeof resetIds !== "function") return "failed: resetIds is not a function";
  const scenarios = {
    // A plain build right after resetIds().
    defaults() {
      resetIds();
      return anOrder();
    },
    // A test mutates its order; the next build must not see it.
    independent() {
      resetIds();
      const first = anOrder();
      first.lines.push({ sku: "GIFT-WRAP", qty: 1, priceCents: 300 });
      first.customer.name = "Changed";
      first.status = "cancelled";
      const second = anOrder();
      return {
        secondLines: second.lines,
        secondCustomer: second.customer,
        secondStatus: second.status,
        secondTotal: second.totalCents,
        sharesLines: first.lines === second.lines,
        sharesCustomer: first.customer === second.customer,
      };
    },
    // Top-level overrides replace; lines are replaced, not appended; the total follows the lines.
    overrides() {
      resetIds();
      const paid = anOrder({
        status: "paid",
        shippingCents: 0,
        lines: [
          { sku: "TEE-02", qty: 1, priceCents: 1999 },
          { sku: "CAP-03", qty: 3, priceCents: 850 },
        ],
      });
      const inconsistent = anOrder({ totalCents: 1 });
      return {
        status: paid.status,
        currency: paid.currency,
        lineSkus: paid.lines.map((line) => line.sku),
        shippingCents: paid.shippingCents,
        totalCents: paid.totalCents,
        explicitTotal: inconsistent.totalCents,
        explicitTotalLines: inconsistent.lines.length,
      };
    },
    // customer merges key by key with the default customer.
    nestedMerge() {
      resetIds();
      const vn = anOrder({ customer: { country: "VN" } });
      const renamed = anOrder({ customer: { name: "Minh Pham", email: "minh@example.com" } });
      const plain = anOrder();
      return { vn: vn.customer, renamed: renamed.customer, plainAfter: plain.customer };
    },
    // Ids are sequential, an explicit id does not use a number, resetIds() starts again.
    ids() {
      resetIds();
      const first = [anOrder().id, anOrder({ id: "ORD-CUSTOM" }).id, anOrder().id, anOrder().id];
      resetIds();
      const afterReset = [anOrder().id, anOrder().id];
      return { first, afterReset };
    },
    // The overrides object is neither changed nor shared with the result.
    overridesUntouched() {
      resetIds();
      const overrides = {
        customer: { country: "VN" },
        lines: [{ sku: "TEE-02", qty: 1, priceCents: 1999 }],
      };
      const before = JSON.stringify(overrides);
      const order = anOrder(overrides);
      order.lines.push({ sku: "GIFT-WRAP", qty: 1, priceCents: 300 });
      order.lines[0].qty = 5;
      order.customer.name = "Changed";
      const again = anOrder(overrides);
      return {
        overridesUnchanged: JSON.stringify(overrides) === before,
        againLines: again.lines,
        againCustomer: again.customer,
        againTotal: again.totalCents,
      };
    },
  };
  const scenario = scenarios[input.scenario];
  if (!scenario) throw new Error(`unknown scenario ${input.scenario}`);
  try {
    return JSON.parse(JSON.stringify(scenario()));
  } catch (error) {
    return `failed: ${error && error.message ? error.message : String(error)}`;
  }
}
