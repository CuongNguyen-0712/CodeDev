// @piece await-critical: Wait only for what the first paint needs
const [restaurant, menu, cart, recommendations, reviews] = await Promise.all([restaurantP, menuP, cartP, recommendationsP, reviewsP]);
return { restaurant, menu, cart, recommendations, reviews };
