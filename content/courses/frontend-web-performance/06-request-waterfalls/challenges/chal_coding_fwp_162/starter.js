// app/restaurants/[slug]/load.js: the data loader of the restaurant page (a Next.js server component
// awaits it). The first paint needs the restaurant, its menu, the customer's cart and the
// recommendations; reviews sit below the fold and stream in later (<Suspense> around them).
//
// api: { restaurant(slug), menu(slug), cart(), reviews(restaurantId), recommendations(categoryIds),
//        preload(url) }  each returns a promise; recommendations need the menu's category ids and
//        reviews need the restaurant's numeric id.
// return: { restaurant, menu, cart, recommendations, reviews: <promise of the reviews> }
async function loadRestaurantPage(slug, api) {
    // [ ] Start every request that needs only the slug
    // [ ] Fetch the hero image as soon as its URL is known
    // [ ] Recommendations once the menu's categories are known
    // [ ] Reviews once the restaurant id is known, not awaited
    // [ ] Wait only for what the first paint needs
}
