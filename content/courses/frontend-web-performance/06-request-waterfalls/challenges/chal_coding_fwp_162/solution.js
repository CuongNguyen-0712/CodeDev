// app/restaurants/[slug]/load.js: the data loader of the restaurant page (a Next.js server component
// awaits it). The first paint needs the restaurant, its menu, the customer's cart and the
// recommendations; reviews sit below the fold and stream in later (<Suspense> around them).
//
// api: { restaurant(slug), menu(slug), cart(), reviews(restaurantId), recommendations(categoryIds),
//        preload(url) }  each returns a promise; recommendations need the menu's category ids and
//        reviews need the restaurant's numeric id.
// return: { restaurant, menu, cart, recommendations, reviews: <promise of the reviews> }
async function loadRestaurantPage(slug, api) {
    // @piece start-independent: Start every request that needs only the slug
    const restaurantP = api.restaurant(slug);
    const menuP = api.menu(slug);
    const cartP = api.cart();
    // @end
    // @piece preload-hero: Fetch the hero image as soon as its URL is known
    restaurantP.then((restaurant) => api.preload(restaurant.heroImage));
    // @end
    // @piece recommendations-after-menu: Recommendations once the menu's categories are known
    const recommendationsP = menuP.then((menu) => api.recommendations(menu.categories.map((c) => c.id)));
    // @end
    // @piece reviews-deferred: Reviews once the restaurant id is known, not awaited
    const reviewsP = restaurantP.then((restaurant) => api.reviews(restaurant.id));
    // @end
    // @piece await-critical: Wait only for what the first paint needs
    const [restaurant, menu, cart, recommendations] = await Promise.all([restaurantP, menuP, cartP, recommendationsP]);
    return { restaurant, menu, cart, recommendations, reviews: reviewsP };
    // @end
}
