import { readFileSync } from "node:fs";

// Rice Rocket courier app: "Today's deliveries" is a FlatList of time-slot headers (40 px) and delivery
// rows (96 px). listConfig builds what the screen hands to FlatList:
//   <FlatList data={items} keyExtractor={cfg.keyOf} getItemLayout={cfg.layoutOf} windowSize={cfg.windowSize}
//     renderItem={({ item }) => item.kind === "slot" ? <SlotHeader slot={item.slot} />
//                                                  : <DeliveryRow {...cfg.rowProps(item)} />} />
//   const DeliveryRow = React.memo(DeliveryRowView, cfg.sameRow);
// `openDelivery` comes from useCallback in the screen, so it is the same function on every render.
// Items are updated immutably: a status change creates a new object for that delivery only.
const SLOT_HEIGHT = 40;
const ROW_HEIGHT = 96;
interface Slot { kind: "slot"; id: string; slot: string }
interface Delivery { kind: "delivery"; id: string; status: string; address: string }
type Item = Slot | Delivery;
interface RowProps { item: Delivery; onOpen: (id: string) => void }
interface ListConfig {
    keyOf: (item: Item, index: number) => string;
    layoutOf: (data: Item[] | null, index: number) => { length: number; offset: number; index: number };
    rowProps: (item: Delivery) => RowProps;
    sameRow: (prev: RowProps, next: RowProps) => boolean;
    windowSize: number;
}

function listConfig(items: Item[], openDelivery: (id: string) => void): ListConfig {
    // [ ] Each item's height and its offset from the top
    return {
        // [ ] A key that follows the delivery, not its position
        layoutOf: (_data: Item[] | null, index: number) => ({ length: heights[index], offset: offsets[index], index }),
        // [ ] Props for one row that stay equal between renders
        // [ ] When React.memo may skip re-rendering a row
        windowSize: 5,
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// A small model of FlatList with getItemLayout: it mounts the items whose layout intersects the visible
// area plus (windowSize - 1) / 2 viewport heights above and below it. Mounted components are matched to
// items by key on every render, as React does: same key = same component instance (its local state, here
// "expanded", stays with the key); a memoized row re-renders only when sameRow says the props changed.
// Input: { slots: [{ slot, deliveries }], viewport, scroll, expand?: id, events: [...] }
//   { status: { id, to } }      dispatch changes one delivery's status (new object for that item only)
//   { insert: { after, id } }   a new delivery is assigned and inserted after the item with id `after`
// Output: mounted index range, a few layout offsets, rows rendered per event, rows showing another
// delivery's expanded state, and whether scrollToIndex lands on the right item.
const input = JSON.parse(readFileSync(0, "utf8")) as {
    slots: { slot: string; deliveries: number }[];
    viewport: number;
    scroll: number;
    expand?: string;
    probe: number[];
    events: ({ status: { id: string; to: string } } | { insert: { after: string; id: string } })[];
};

let items: Item[] = [];
let n = 0;
for (const s of input.slots) {
    items.push({ kind: "slot", id: `slot-${s.slot}`, slot: s.slot });
    for (let i = 0; i < s.deliveries; i++) {
        n++;
        items.push({ kind: "delivery", id: `d-${n}`, status: "assigned", address: `${n} Le Loi, District 1` });
    }
}

const openDelivery = (id: string) => { void id; };
interface Instance { forId: string; props: RowProps | null; expanded: boolean }
const mounted = new Map<string, Instance>(); // key -> component instance

// The true layout, for checking getItemLayout.
const trueOffsets = (list: Item[]) => {
    const out: number[] = [];
    let y = 0;
    for (const it of list) { out.push(y); y += it.kind === "slot" ? SLOT_HEIGHT : ROW_HEIGHT; }
    return out;
};

function render(list: Item[]): { rendered: number; range: [number, number] } {
    const cfg = listConfig(list, openDelivery);
    const half = ((cfg.windowSize - 1) / 2) * input.viewport;
    const top = input.scroll - half;
    const bottom = input.scroll + input.viewport + half;
    const inWindow: number[] = [];
    list.forEach((_, i) => {
        const l = cfg.layoutOf(list, i);
        if (l.offset + l.length > top && l.offset < bottom) inWindow.push(i);
    });
    let rendered = 0;
    const keep = new Set<string>();
    for (const i of inWindow) {
        const item = list[i];
        const key = cfg.keyOf(item, i);
        keep.add(key);
        // A different component type under the same key is a new instance (React remounts it).
        if (item.kind !== "delivery") { mounted.delete(key); continue; }
        const props = cfg.rowProps(item);
        const existing = mounted.get(key);
        if (!existing) {
            mounted.set(key, { forId: item.id, props, expanded: false });
            rendered++;
        } else if (!existing.props || !cfg.sameRow(existing.props, props)) {
            existing.props = props;
            rendered++;
        }
    }
    for (const key of [...mounted.keys()]) if (!keep.has(key)) mounted.delete(key);
    return { rendered, range: [inWindow[0] ?? -1, inWindow[inWindow.length - 1] ?? -1] };
}

const first = render(items);
const cfg0 = listConfig(items, openDelivery);
if (input.expand) {
    const i = items.findIndex((it) => it.id === input.expand);
    const inst = mounted.get(cfg0.keyOf(items[i], i));
    if (inst) inst.expanded = true;
}

const renderedPerEvent: number[] = [];
for (const e of input.events) {
    if ("status" in e) {
        items = items.map((it) => (it.id === e.status.id && it.kind === "delivery" ? { ...it, status: e.status.to } : it));
    } else {
        const at = items.findIndex((it) => it.id === e.insert.after) + 1;
        items = [...items.slice(0, at), { kind: "delivery", id: e.insert.id, status: "assigned", address: "new" }, ...items.slice(at)];
    }
    renderedPerEvent.push(render(items).rendered);
}

// Which delivery does each expanded instance show now? Its key decides.
const cfg = listConfig(items, openDelivery);
let wrongExpanded = 0;
items.forEach((it, i) => {
    const inst = mounted.get(cfg.keyOf(it, i));
    if (inst && inst.expanded && inst.forId !== it.id) wrongExpanded++;
});
const real = trueOffsets(items);
console.log(JSON.stringify({
    firstRange: first.range,
    firstRendered: first.rendered,
    offsets: input.probe.map((i) => cfg.layoutOf(items, i).offset),
    layoutMatches: items.every((_, i) => cfg.layoutOf(items, i).offset === real[i]),
    renderedPerEvent,
    wrongExpanded,
}));
