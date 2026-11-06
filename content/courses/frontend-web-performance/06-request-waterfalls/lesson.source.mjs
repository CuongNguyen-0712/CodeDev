// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-3-1",
    title: "Request waterfalls and parallel loading",
    slug: { _type: "slug", current: "request-waterfalls-parallel-loading" },
    description:
        "Rice Rocket's restaurant page awaited five requests one after another and only then started the hero image: almost a second before anything rendered. Learn to read a waterfall, start independent requests together, chain only real dependencies, preload what the browser will need, and stream the slow, below-the-fold data.",
    estimatedTime: 14,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The restaurant page of the Next.js app is the most visited page after the home page. Real-user LCP on it was 3.4 s at p75. The server loader awaited each request in turn, and the hero photo, the LCP element, only began downloading after the HTML arrived.",
    },

    content: [
        h2("Situation"),
        code("js", `
export async function loadRestaurantPage(slug, api) {
  const restaurant = await api.restaurant(slug);                  // 120 ms
  const menu = await api.menu(slug);                              // 180 ms
  const cart = await api.cart();                                  //  90 ms
  const reviews = await api.reviews(restaurant.id);               // 400 ms
  const recommendations = await api.recommendations(
    menu.categories.map((c) => c.id));                            // 150 ms
  return { restaurant, menu, cart, reviews, recommendations };    // ~940 ms in total
}`, "app/restaurants/[slug]/load.js"),
        code("text", `
Server timing (one request, illustrative)
restaurant       |████|
menu                  |██████|
cart                         |███|
reviews                          |█████████████|
recommendations                                |█████|
hero image                                           (HTML sent)  |██████|
                 0        200       400       600       800      1000 ms`, "waterfall"),
        p("Only two edges in that chart are real dependencies: reviews need the restaurant's id, and recommendations need the menu's categories. Everything else waits for no reason."),

        h2("The core you need"),
        bullets([
            "**A promise starts its work when the function is called.** `await` only pauses until it settles. Call every independent request first, keep the promises, then await them together with `Promise.all`.",
            "**Chain only the edges that exist.** `menuP.then((menu) => api.recommendations(...))` starts the recommendations the moment the menu arrives, while the other requests are still in flight.",
            "**The critical path decides the first paint.** Here it is the longest chain the page cannot render without: menu (180 ms) then recommendations (150 ms) = 330 ms, not the 940 ms sum.",
            "**Stream what is below the fold.** Return the reviews promise unawaited; in Next.js a server component wrapped in `<Suspense>` renders it when it resolves, and the rest of the page is sent first.",
            "**Tell the browser early about the LCP image.** `preload` (React 19's `preload()` from `react-dom`, or `<link rel=\"preload\" as=\"image\" fetchpriority=\"high\">`) starts the hero download as soon as its URL is known instead of after the HTML is parsed.",
        ]),

        h2("Apply it in the project"),
        code("jsx", `
import { preload } from "react-dom";

export async function loadRestaurantPage(slug, api) {
  const restaurantP = api.restaurant(slug);
  const menuP = api.menu(slug);
  const cartP = api.cart();
  restaurantP.then((r) => preload(r.heroImage, { as: "image", fetchPriority: "high" }));
  const recommendationsP = menuP.then((m) => api.recommendations(m.categories.map((c) => c.id)));
  const reviewsP = restaurantP.then((r) => api.reviews(r.id));

  const [restaurant, menu, cart, recommendations] =
    await Promise.all([restaurantP, menuP, cartP, recommendationsP]);
  return { restaurant, menu, cart, recommendations, reviews: reviewsP };
}

// page.jsx
<Suspense fallback={<ReviewsSkeleton />}>
  <Reviews reviews={data.reviews} />   {/* use(reviews) inside */}
</Suspense>`, "app/restaurants/[slug]/load.js"),
        callout("warning", "Errors in unawaited promises",
            "A promise you return or keep must still have its rejection handled somewhere: the `<Suspense>` child's error boundary for the reviews, a `.catch` for a preload. An unhandled rejection in a server component can fail the whole request."),

        h2("Verify"),
        code("text", `
Chrome DevTools > Network, throttled to Fast 4G, reload the restaurant page
- the document's Server-Timing (or your tracing) shows restaurant, menu and cart starting together
- the hero image request starts before the HTML has finished downloading (Initiator: preload)
- Performance panel: LCP 3.4 s -> 2.1 s on the same throttling (illustrative)`, "devtools"),

        h2("Pitfalls"),
        bullets([
            "**`await` inside a loop.** `for (const id of ids) results.push(await api.dish(id))` is a waterfall of N requests. Map to promises first, then `await Promise.all(...)` (with a limit if N is large).",
            "**`Promise.all` that includes the slow, optional request.** One 2 s reviews call then holds back the whole page. Await only what the first paint needs.",
            "**Preloading too much.** Every `preload` competes for bandwidth with the LCP image. Preload the one hero image, not every photo in the menu; check the Network panel for warnings about unused preloads.",
        ]),

        p("Now remove the waterfall. The editor holds the loader with its blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces put a delay back on purpose. Run executes the loader against a fake API on a virtual clock and reports when each request started and when the page was ready."),
        challenge("chal_coding_fwp_162"),
    ],
});
