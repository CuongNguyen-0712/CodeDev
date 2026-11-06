// @piece sort-order: Order two courses for the chosen sort
let order = 0;
if (sort === "rating") order = b.rating - a.rating;
else if (sort === "newest") order = (b.publishedAt < a.publishedAt ? -1 : b.publishedAt > a.publishedAt ? 1 : 0);
else order = (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0);
return order;
