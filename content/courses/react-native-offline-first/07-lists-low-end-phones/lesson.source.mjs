// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-3-1",
    title: "Lists on low-end phones",
    slug: { _type: "slug", current: "react-native-lists-low-end-phones" },
    description:
        "Rice Rocket's delivery list stuttered on the cheap Android phones most couriers carry: blank areas while scrolling, every row re-rendering when one status changed, and an expanded row that jumped to another delivery. Learn how FlatList renders a window, why getItemLayout, stable keys and memoized rows matter, and configure the list for low-end phones.",
    estimatedTime: 15,

    scenario: {
        role: "Mobile developer on Rice Rocket's courier app (React Native, Expo)",
        problem:
            "At lunch a courier has 30 to 40 deliveries in \"Today's deliveries\". On a Galaxy A03 the list dropped to about 11 JS frames per second while scrolling, showed white gaps on a fast fling, and every dispatch update made the whole visible list flicker.",
    },

    content: [
        h2("Situation"),
        p("The list as it shipped in 2.3:"),
        code("tsx", `
<FlatList
  data={items}                                  // slot headers and delivery rows
  keyExtractor={(_, index) => String(index)}
  renderItem={({ item }) =>
    item.kind === "slot"
      ? <SlotHeader slot={item.slot} />
      : <DeliveryRow item={item} onOpen={() => navigation.navigate("Delivery", { id: item.id })} />}
/>`, "src/screens/deliveries/DeliveriesScreen.tsx (v2.3)"),
        bullets([
            "Perf Monitor while scrolling: UI 60 fps, JS around 11 fps. The JS thread could not render rows fast enough.",
            "A status change from dispatch re-rendered every visible row: each render created a new `onOpen` arrow, so nothing could be skipped.",
            "Dispatch inserted a delivery at the top and the row the courier had expanded now showed another customer's address.",
        ]),

        h2("The core you need"),
        bullets([
            "**FlatList renders a window, not the list.** It keeps items rendered within `windowSize` viewport heights (default 21: the screen plus 10 above and 10 below) and mounts more in batches as you scroll. Smaller windows mean less work but blank areas on a fast fling.",
            "**`getItemLayout` skips measuring.** When FlatList knows each item's height and offset up front, it can compute the window and `scrollToIndex` without rendering and measuring rows. With two item heights (40 px headers, 96 px rows) the offsets are a running sum, not `index * height`.",
            "**Keys decide which instance gets which item.** `keyExtractor` must return the delivery id. With the index, an insert shifts every item onto a different component instance: local state (expanded, image loaded) lands on the wrong delivery and every row after the insert re-renders.",
            "**Memoized rows need stable props.** `React.memo(DeliveryRow, sameRow)` skips a render when the comparison says the props are equal. That only works if unchanged deliveries keep the same object (immutable updates) and callbacks come from `useCallback`, not a new arrow per render.",
            "**FlashList recycles views.** Shopify's FlashList reuses row views instead of mounting new ones and is a common upgrade for long lists; the same rules about keys and stable props apply. Its configuration options have changed between major versions, so follow the docs of the version you install.",
        ]),

        h2("Apply it in the project"),
        p("Build the list props once per data change in a small module, so they can be tested without a device:"),
        code("tsx", `
const SLOT_HEIGHT = 40;
const ROW_HEIGHT = 96;

export function listConfig(items: Item[], openDelivery: (id: string) => void) {
  const heights = items.map((item) => (item.kind === "slot" ? SLOT_HEIGHT : ROW_HEIGHT));
  const offsets: number[] = [];
  let y = 0;
  for (const h of heights) { offsets.push(y); y += h; }
  return {
    keyOf: (item: Item) => item.id,
    layoutOf: (_: unknown, index: number) => ({ length: heights[index], offset: offsets[index], index }),
    rowProps: (item: Delivery) => ({ item, onOpen: openDelivery }),
    sameRow: (a: RowProps, b: RowProps) => a.item === b.item && a.onOpen === b.onOpen,
    windowSize: 5,
  };
}

// DeliveriesScreen.tsx
const Row = React.memo(DeliveryRowView, (a: RowProps, b: RowProps) => a.item === b.item && a.onOpen === b.onOpen); // module level

const openDelivery = useCallback((id: string) => navigation.navigate("Delivery", { id }), [navigation]);
const cfg = useMemo(() => listConfig(items, openDelivery), [items, openDelivery]);

<FlatList
  data={items}
  keyExtractor={cfg.keyOf}
  getItemLayout={cfg.layoutOf}
  windowSize={cfg.windowSize}
  renderItem={({ item }) => item.kind === "slot" ? <SlotHeader slot={item.slot} /> : <Row {...cfg.rowProps(item)} />}
/>`, "src/screens/deliveries/listConfig.ts"),
        callout("info", "Images are part of the row cost",
            "Rows that decode full-size photos are slow no matter how the list is configured. Serve thumbnails at the displayed size and use an image component with caching (for example expo-image)."),

        h2("Verify"),
        code("bash", `
# Release build on the slowest phone you support; the dev menu's Perf Monitor shows UI and JS fps
npx expo run:android --variant release
# Scroll "Today's deliveries" fast for 10 seconds:
#   before: JS 11 fps, white gaps on fling
#   after:  JS 55-60 fps, no gaps at windowSize 5
# React DevTools Profiler (dev build): change one delivery's status from the dispatch console
#   before: 31 DeliveryRow renders     after: 1 DeliveryRow render`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Measuring performance in a debug build.** Development mode adds checks that make every list look slow. Compare release builds on a real low-end device.",
            "**A `getItemLayout` that ignores headers.** `index * ROW_HEIGHT` drifts by 56 px per header; `scrollToIndex` lands on the wrong delivery and rows pop in late. Detect it by jumping to an item far down the list and checking which one is at the top.",
            "**Memo comparing deep content.** A deep-equal `sameRow` costs as much as rendering. Keep updates immutable and compare references.",
        ]),

        challenge("chal_quiz_rno_171"),
        p("Now configure the list. The editor holds `listConfig(items, openDelivery)` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run models FlatList's render window and React's key matching, applies dispatch updates and counts the rows rendered."),
        challenge("chal_coding_rno_172"),
    ],
});
