// Harness: Fix the fire-and-forget checkout
// The api, analytics and ui are fakes on a virtual clock. Latencies:
//   analytics.track 5 ms, loadReceiptTemplate 40 ms, createOrder 200 ms,
//   reserveStock 100 ms for the 1st item, +50 ms for each following item.
// input: { items: [sku...], trackFails?, templateFails?, createFails?, outOfStock?: { sku: message } }
// The clock jumps from one pending call to the next; between two steps the harness yields a real
// macrotask, so the runtime gets the chance to report promises that rejected with no handler -
// exactly what a browser (unhandledrejection) or Node.js (unhandledRejection) would report.
// Output:
//   { outcome: "confirmed", value, at, reservedBeforeConfirm, spinner, unhandledRejections }
//   { outcome: "failed", error, spinner, unhandledRejections }
async function __harness(input) {
    // --- collect unhandled rejections (browser worker or the Node-based verifier) ---
    const unhandled = [];
    const onBrowserEvent = (event) => {
        event.preventDefault();
        unhandled.push(event.reason);
    };
    const onNodeEvent = (reason) => {
        unhandled.push(reason);
    };
    const ignore = () => {};
    const nodeProcess = typeof globalThis.process === "object" && globalThis.process && typeof globalThis.process.on === "function"
        ? globalThis.process
        : null;
    if (nodeProcess) {
        nodeProcess.on("unhandledRejection", onNodeEvent);
        nodeProcess.on("rejectionHandled", ignore);
    } else if (typeof addEventListener === "function") {
        addEventListener("unhandledrejection", onBrowserEvent);
    }

    // --- virtual clock ---
    let now = 0;
    let seq = 0;
    const queue = new Map();
    function after(ms, settle) {
        const id = ++seq;
        queue.set(id, { id, at: now + ms, settle });
    }
    function call(ms, failure, value) {
        return new Promise((resolve, reject) => {
            after(ms, () => (failure ? reject(new Error(failure)) : resolve(value)));
        });
    }

    // --- fakes ---
    let spinner = "hidden";
    let reserved = 0;
    const outOfStock = input.outOfStock || {};
    const cart = { items: (input.items || []).map((sku) => ({ sku })) };
    const deps = {
        api: {
            createOrder() {
                return call(200, input.createFails, { id: "ord-1001" });
            },
            reserveStock(orderId, sku) {
                const index = cart.items.findIndex((item) => item.sku === sku);
                return call(100 + 50 * Math.max(0, index), outOfStock[sku], undefined).then(() => {
                    reserved += 1;
                });
            },
            loadReceiptTemplate() {
                return call(40, input.templateFails, "receipt-v2");
            },
        },
        analytics: {
            track() {
                return call(5, input.trackFails, undefined);
            },
        },
        ui: {
            setBusy(busy) {
                spinner = busy ? "visible" : "hidden";
            },
        },
    };

    // --- run ---
    let settled = null;
    let promise;
    try {
        promise = Promise.resolve(placeOrder(cart, deps));
    } catch (error) {
        promise = Promise.reject(error);
    }
    promise.then(
        (value) => { settled = { outcome: "confirmed", value, at: now, reservedBeforeConfirm: reserved }; },
        (error) => { settled = { outcome: "failed", error: error && error.message ? error.message : String(error) }; },
    );

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    for (let guard = 0; guard < 500; guard++) {
        let next = null;
        for (const timer of queue.values()) {
            if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        queue.delete(next.id);
        now = next.at;
        next.settle();
        await tick();
    }
    // Browsers fire unhandledrejection in a separate task: give it a few turns to arrive.
    for (let i = 0; i < 3; i++) await tick();

    if (nodeProcess) {
        nodeProcess.off("unhandledRejection", onNodeEvent);
        nodeProcess.off("rejectionHandled", ignore);
    } else if (typeof removeEventListener === "function") {
        removeEventListener("unhandledrejection", onBrowserEvent);
    }

    return { ...(settled || { outcome: "still pending" }), spinner, unhandledRejections: unhandled.length };
}
