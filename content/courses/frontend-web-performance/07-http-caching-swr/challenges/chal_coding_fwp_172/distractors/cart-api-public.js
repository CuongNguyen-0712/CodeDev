// @piece cart-api: The customer's own cart
if (path === "/api/cart") return { "Cache-Control": "public, max-age=30" };
