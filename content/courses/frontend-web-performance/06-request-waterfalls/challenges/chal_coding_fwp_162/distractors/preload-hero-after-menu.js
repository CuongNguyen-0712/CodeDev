// @piece preload-hero: Fetch the hero image as soon as its URL is known
Promise.all([restaurantP, menuP]).then(([restaurant]) => api.preload(restaurant.heroImage));
