// @piece invalidate-on-write: Change the price, then drop the cached menu
cache.evict(key);
db.updatePrice(key, price, now);
