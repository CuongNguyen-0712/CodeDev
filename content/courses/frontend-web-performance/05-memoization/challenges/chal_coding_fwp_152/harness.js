// Harness: a tiny React stand-in that renders the learner's MenuPage over a sequence of updates.
// Rules follow React's documentation:
// - memo(Component): skips a render when every prop is Object.is-equal to the previous render's
//   props for the same key (the dish id), and reuses the previous output.
// - useMemo / useCallback: keep the value while every dependency is Object.is-equal; hooks are matched
//   by call order, as in React.
// - render(Component, props): stands for <Component key={props.item.id} {...props} />.
// filterMenu is provided here (lib/search.js) and counted: it is the expensive call.
//
// input:  { items, steps: [step] } where step is one of
//   { render: { query?, cartIds?, owner? } }  props for the next render of MenuPage (others unchanged);
//                                              owner names the addToCart function in use ("guest", "mai", ...)
//   { click: <dish id> }                       clicks "Add" on that card
// output: { steps: [{ cardRenders, filterRuns, visible: [ids], inCart: [ids] } | { clickedBy: owner }] }
//      or { error }

let __hooks = [];
let __hookIndex = 0;
let __filterRuns = 0;
let __cardRenders = 0;
let __prevCards = new Map();
let __nextCards = new Map();

function memo(Component) {
    return { memo: true, Component };
}

function __depsEqual(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

function useMemo(factory, deps) {
    const i = __hookIndex++;
    const slot = __hooks[i];
    if (slot && __depsEqual(slot.deps, deps)) return slot.value;
    const value = factory();
    __hooks[i] = { deps, value };
    return value;
}

function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
}

function render(type, props) {
    const key = props && props.item ? props.item.id : __nextCards.size;
    const prev = __prevCards.get(key);
    const keys = Object.keys(props);
    const same = type.memo && prev && prev.type === type && keys.length === Object.keys(prev.props).length
        && keys.every((k) => Object.is(props[k], prev.props[k]));
    let output;
    if (same) output = prev.output;
    else {
        __cardRenders++;
        output = (type.memo ? type.Component : type)(props);
    }
    __nextCards.set(key, { type, props, output });
    return output;
}

function filterMenu(items, query) {
    __filterRuns++;
    const q = String(query || "").trim().toLowerCase();
    return items.filter((item) => !q || item.name.toLowerCase().includes(q) || item.tags.some((t) => t.toLowerCase() === q));
}

async function __harness(input) {
    const items = input.items.map((i) => ({ ...i }));
    const owners = new Map();
    const clicks = [];
    const addToCartOf = (owner) => {
        if (!owners.has(owner)) owners.set(owner, (id) => clicks.push({ owner, id }));
        return owners.get(owner);
    };
    let props = { items, query: "", cartIds: [], addToCart: addToCartOf("guest") };
    let lastCards = [];
    const out = [];
    try {
        for (const step of input.steps) {
            if (step.click !== undefined) {
                const card = lastCards.find((c) => c && c.id === step.click);
                if (!card) { out.push({ clickedBy: null }); continue; }
                const before = clicks.length;
                card.add();
                out.push({ clickedBy: clicks.length > before ? clicks[clicks.length - 1].owner : null });
                continue;
            }
            const r = step.render || {};
            props = {
                ...props,
                ...(r.query !== undefined ? { query: r.query } : {}),
                ...(r.cartIds !== undefined ? { cartIds: [...r.cartIds] } : {}),
                ...(r.owner !== undefined ? { addToCart: addToCartOf(r.owner) } : {}),
            };
            __hookIndex = 0;
            __filterRuns = 0;
            __cardRenders = 0;
            __nextCards = new Map();
            lastCards = MenuPage({ ...props });
            __prevCards = __nextCards;
            out.push({
                cardRenders: __cardRenders,
                filterRuns: __filterRuns,
                visible: lastCards.map((c) => c && c.id),
                inCart: lastCards.filter((c) => c && c.inCart).map((c) => c.id),
            });
        }
        return { steps: out };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
