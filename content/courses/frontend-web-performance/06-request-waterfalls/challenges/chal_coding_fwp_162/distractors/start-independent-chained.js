// @piece start-independent: Start every request that needs only the slug
const restaurantP = api.restaurant(slug);
const menuP = restaurantP.then(() => api.menu(slug));
const cartP = menuP.then(() => api.cart());
