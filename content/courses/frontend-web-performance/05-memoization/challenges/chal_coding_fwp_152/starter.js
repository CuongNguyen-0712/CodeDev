// app/restaurants/[slug]/menu-page.jsx, as plain functions so it runs outside React.
// The grader provides React's memo, useMemo and useCallback with the same rules, and render(), which
// stands for writing <Component {...props} /> inside the returned list.
// filterMenu (lib/search.js) is the expensive part: about 8 ms for the 300 dishes of a big restaurant.
//
// props:  { items: [{ id, name, price, tags }], query, cartIds: [id], addToCart(id) }
// return: one rendered card per dish that matches the query

function MenuPage({ items, query, cartIds, addToCart }) {
    // [ ] Filter again only when the dishes or the query change
    // [ ] Which dishes are in the cart, rebuilt when the cart changes
    // [ ] One add handler that follows the current addToCart
    // [ ] One card per dish with only the props it needs
}

// One dish card. memo: it renders again only when one of its props changes (Object.is).
const MenuItem = memo(function MenuItem({ item, inCart, onAdd }) {
    return { id: item.id, label: `${item.name} ${formatPrice(item.price)}`, inCart, add: () => onAdd(item.id) };
});

function formatPrice(vnd) {
    return `${vnd.toLocaleString("en-US")} VND`;
}
