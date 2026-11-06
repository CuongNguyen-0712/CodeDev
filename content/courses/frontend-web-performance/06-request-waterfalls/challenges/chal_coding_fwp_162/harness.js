// Harness: runs the learner's loadRestaurantPage against a fake API on a virtual clock.
// Every API call resolves after its latency (ms of virtual time); the clock jumps to the next
// pending response once all microtasks have run, so the result is the same on every machine.
// input:  { slug, latency: { restaurant, menu, cart, reviews, recommendations } }
// output: { readyAt, starts: { <call>: ms }, calls: { <call>: count }, page: { ... },
//           reviews: { deferred, readyAt, count } }  or { error, starts }
async function __harness(input) {
    const L = input.latency;
    let now = 0;
    const timers = [];
    const starts = {};
    const calls = {};
    const later = (ms, value, fail) => new Promise((resolve, reject) => {
        timers.push({ at: now + ms, run: () => (fail ? reject(new Error(fail)) : resolve(value)) });
    });
    const record = (name) => {
        calls[name] = (calls[name] || 0) + 1;
        if (!(name in starts)) starts[name] = now;
    };
    const RESTAURANT = { id: 42, slug: input.slug, name: "Com Tam Ba Ghien", heroImage: "/img/r42-hero.avif" };
    const MENU = { categories: [{ id: "rice" }, { id: "drinks" }], dishes: 24 };
    const api = {
        restaurant(slug) { record("restaurant"); return later(L.restaurant, { ...RESTAURANT }, slug === input.slug ? null : `404 restaurant ${slug}`); },
        menu(slug) { record("menu"); return later(L.menu, JSON.parse(JSON.stringify(MENU)), slug === input.slug ? null : `404 menu ${slug}`); },
        cart() { record("cart"); return later(L.cart, { items: 2 }); },
        reviews(id) {
            record("reviews");
            const p = later(L.reviews, [{ stars: 5 }, { stars: 4 }, { stars: 5 }], id === 42 ? null : `404 reviews for ${id}`);
            p.then(() => { reviewsAt = now; }, () => {});
            return p;
        },
        recommendations(ids) {
            record("recommendations");
            const ok = Array.isArray(ids) && ids.join(",") === "rice,drinks";
            return later(L.recommendations, ["d05", "d09"], ok ? null : `400 recommendations need the menu's category ids, got ${JSON.stringify(ids)}`);
        },
        preload(url) { record("preload"); return later(60, url === RESTAURANT.heroImage, null); },
    };
    let reviewsAt = null;
    const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

    let state = "pending";
    let result;
    let error;
    let readyAt = null;
    let reviewsValue;
    loadRestaurantPage(input.slug, api).then(
        (r) => { state = "done"; result = r; readyAt = now; },
        (e) => { state = "failed"; error = e; },
    );
    let watching = false;
    for (let guard = 0; guard < 500; guard++) {
        await flush();
        if (state === "done" && !watching) {
            watching = true;
            Promise.resolve(result && result.reviews).then((v) => { reviewsValue = v; }, () => {});
            await flush();
        }
        if (!timers.length) break;
        timers.sort((a, b) => a.at - b.at);
        const t = timers.shift();
        now = t.at;
        t.run();
    }
    await flush();
    if (state === "failed") return { error: error instanceof Error ? error.message : String(error), starts };
    if (state !== "done") return { error: "the loader never finished", starts };
    const deferred = Boolean(result.reviews) && typeof result.reviews.then === "function";
    return {
        readyAt,
        starts,
        calls,
        page: {
            restaurant: result.restaurant && result.restaurant.name,
            dishes: result.menu && result.menu.dishes,
            cartItems: result.cart && result.cart.items,
            recommendations: result.recommendations,
        },
        reviews: { deferred, readyAt: reviewsAt, count: Array.isArray(reviewsValue) ? reviewsValue.length : null },
    };
}
