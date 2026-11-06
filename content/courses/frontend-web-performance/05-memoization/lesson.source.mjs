// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-2-3",
    title: "Memoization that actually helps",
    slug: { _type: "slug", current: "react-memoization-that-helps" },
    description:
        "Rice Rocket's menu page re-rendered all 300 dish cards on every keystroke although they were wrapped in memo, a quick fix showed stale search results, and a guest's cart kept filling after login. Learn when memo, useMemo and useCallback skip work, why an inline arrow or a missing dependency breaks them, and what the React Compiler changes.",
    estimatedTime: 15,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The restaurant menu page of the Next.js ordering app has a search box. On a mid-range Android phone, typing felt sticky: INP on that page was 380 ms at p75. The React Profiler showed every dish card rendering on every keystroke.",
    },

    content: [
        h2("Situation"),
        p("The menu page as it shipped. `MenuItem` is wrapped in `memo`, and the team expected that to be enough:"),
        code("jsx", `
const MenuItem = memo(function MenuItem({ item, inCart, onAdd }) {
  return (
    <li>
      {item.name} {formatPrice(item.price)}
      <button onClick={onAdd}>{inCart ? "Added" : "Add"}</button>
    </li>
  );
});

export function MenuPage({ items, query, cartIds, addToCart }) {
  const visible = filterMenu(items, query);           // ~8 ms for 300 dishes
  return (
    <ul>
      {visible.map((item) => (
        <MenuItem
          key={item.id}
          item={item}
          inCart={cartIds.includes(item.id)}
          onAdd={() => addToCart(item.id)}            // a new function every render
        />
      ))}
    </ul>
  );
}`, "app/restaurants/[slug]/menu-page.jsx"),
        bullets([
            "Profiler, one keystroke: `MenuItem (memo) x300`, reason `Props changed: (onAdd)`.",
            "A teammate wrapped the filter in `useMemo(() => filterMenu(items, query), [items])`: typing got fast, and the results stopped following the query.",
            "Another wrapped the handler in `useCallback(..., [])`: after a guest logged in, Add still called the guest's `addToCart`.",
        ]),

        h2("The core you need"),
        bullets([
            "**`memo` compares props with `Object.is`.** A card renders again when any prop is a different value or a different object than last time. A function, object or array created during the parent's render is always new, so it defeats `memo` on every render.",
            "**`useCallback(fn, deps)` keeps the same function** while the dependencies are equal; `useMemo(factory, deps)` keeps the same computed value. Both re-run when any dependency changes (compared with `Object.is`).",
            "**Every value the function reads from the component goes in the dependency array.** Leaving one out does not make the code faster; it makes it read an old value (a stale closure). The `react-hooks/exhaustive-deps` lint rule catches this.",
            "**Memoize what is expensive or what a memoized child compares.** `filterMenu` at 8 ms is worth caching; `formatPrice` at a microsecond is not, because the hook's own bookkeeping costs about the same.",
            "**Give each child only what it needs.** `inCart={inCart.has(item.id)}` is a boolean that changes for one card; passing the whole `cartIds` array changes for every card when the cart changes.",
            "**The React Compiler** (stable since late 2025, hedge on your Next.js version) inserts this memoization automatically at build time and works alongside existing `useMemo` / `useCallback`. It does not remove the need to understand why a prop changes: an object created in a loop is still a new object.",
        ]),

        h2("Apply it in the project"),
        code("jsx", `
export function MenuPage({ items, query, cartIds, addToCart }) {
  const visible = useMemo(() => filterMenu(items, query), [items, query]);
  const inCart = useMemo(() => new Set(cartIds), [cartIds]);
  const onAdd = useCallback((id) => addToCart(id), [addToCart]);

  return (
    <ul>
      {visible.map((item) => (
        <MenuItem key={item.id} item={item} inCart={inCart.has(item.id)} onAdd={onAdd} />
      ))}
    </ul>
  );
}

const MenuItem = memo(function MenuItem({ item, inCart, onAdd }) {
  return (
    <li>
      {item.name} {formatPrice(item.price)}
      <button onClick={() => onAdd(item.id)}>{inCart ? "Added" : "Add"}</button>
    </li>
  );
});`, "app/restaurants/[slug]/menu-page.jsx"),
        callout("info", "The arrow moved, it did not disappear",
            "`() => onAdd(item.id)` still creates a function on every card render. That is fine: it lives inside the card and is passed to a plain `<button>`, which does not compare props. What matters is the prop the memoized card receives."),

        h2("Verify"),
        code("text", `
React DevTools > Profiler > Settings: "Record why each component rendered"
Type "pho" in the search box, stop recording.

Before   commit 14   MenuItem (memo) x300   Props changed: (onAdd)
After    commit 14   MenuItem (memo) x0     (narrowing the list keeps the same props)
         commit 15   MenuItem (memo) x1     Props changed: (inCart)   <- one dish added

web-vitals in production, menu page, p75 INP: 380 ms -> 140 ms (illustrative)`, "profiler"),

        h2("Pitfalls"),
        bullets([
            "**Inline objects and arrays as props.** `style={{ margin: 8 }}` or `tags={[...]}` on a memoized child is a new object every time. Detect it in the Profiler's \"Props changed\" list; hoist constants out of the component or memoize them.",
            "**Silencing the dependency lint rule.** An `eslint-disable-next-line react-hooks/exhaustive-deps` above a hook is the usual source of stale closures. Treat every disable comment as a bug report.",
            "**Context that changes on every render.** `<CartContext.Provider value={{ cart, add }}>` re-renders every consumer each time the provider renders. Memoize the value or split the context.",
        ]),

        challenge("chal_quiz_fwp_151"),
        p("Now fix the menu page. The editor holds `MenuPage` with its four blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last week's buggy versions on purpose. Run renders the page through typing, cart changes and a login, and counts card renders and filter runs."),
        challenge("chal_coding_fwp_152"),
    ],
});
