// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-2-2",
    title: "Virtualizing long lists",
    slug: { _type: "slug", current: "virtualizing-long-lists" },
    description:
        "Rice Rocket's food-court menu rendered all 3,000 rows at once: 45,000 DOM nodes, a slow first render and stuttering scroll on budget phones, and the wrong dish photos after filtering. Learn how list virtualization renders only the rows in view, how variable row heights and overscan work, and why keys must follow the item, then write the window calculation.",
    estimatedTime: 16,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The food-court page lists 12 to 40 stalls with their dishes: up to 3,000 rows of two heights (stall headers and dish cards). It rendered every row, and after the vegetarian filter some dish cards kept the photo of the dish that used to be at their position.",
    },

    content: [
        h2("Situation"),
        code("text", `
Food-court page, Galaxy A05 class phone
  DOM nodes            45,210
  First render         1.9 s (one long task of 1.4 s in React commit)
  Scroll               dropped frames while images decode
  After "vegetarian"   row 5 shows the photo of the dish previously at row 5`, "measurements"),
        code("tsx", `
{rows.map((row, i) => (
  <MenuRow key={i} row={row} />          // every row, keyed by position
))}`, "menu/MenuList.tsx"),

        h2("The core you need"),
        bullets([
            "**Render what the user can see.** A virtualized list renders the rows inside the viewport plus a few extra (overscan) above and below, inside one container as tall as the whole list, so the scrollbar stays honest.",
            "**Positions come from heights.** Keep the top of every row (a running sum of heights). The first visible row is the first whose bottom is below `scrollTop`; find it with a binary search, because the list is long and scroll events are frequent. Rows starting at or below `scrollTop + viewport height` are not visible.",
            "**Overscan hides the gap while scrolling** but must stay inside the list: no negative start, no end past the last row.",
            "**Keys must follow the item.** React reuses a component by key. With index keys, filtering moves different data into existing components, and state such as a loaded image or an open menu stays with the position. Use the row's stable `id`.",
            "**Libraries do this for you.** TanStack Virtual (`useVirtualizer`) and react-window on the web, FlashList in React Native: you pass `count`, an `estimateSize` per index and `getItemKey`, and render what they return. CSS `content-visibility: auto` is a lighter option when the DOM size itself is acceptable.",
        ]),

        h2("Apply it in the project"),
        code("tsx", `
import { useVirtualizer } from "@tanstack/react-virtual";

export function MenuList({ rows }: { rows: MenuRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === "stall" ? 40 : 96),
    getItemKey: (i) => rows[i].id,        // keys follow the dish, not the position
    overscan: 3,
  });
  return (
    <div ref={parentRef} style={{ height: "100dvh", overflow: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => (
          <div key={v.key} style={{ position: "absolute", top: 0, transform: \`translateY(\${v.start}px)\`, width: "100%" }}>
            <MenuRow row={rows[v.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}`, "menu/MenuList.tsx"),
        callout("info", "What the library computes",
            "Under the hook is a small calculation: tops from heights, a binary search for the first visible row, a walk to the bottom edge, overscan clamped to the list, keys from ids. The challenge asks you to write exactly that, so you can debug it when rows jump or flicker."),

        h2("Verify"),
        code("text", `
Food-court page, same phone
  DOM nodes            1,180
  First render         0.4 s
  Scroll               60 fps in the Performance panel's frames track
  After "vegetarian"   each card keeps its own photo (React DevTools: same key, same dish)`, "measurements"),

        h2("Pitfalls"),
        bullets([
            "**Index keys.** Wrong photos, lost input state and re-mounted rows after filtering or sorting. Detect it with React DevTools \"Highlight updates\": filtered rows re-render instead of moving.",
            "**Wrong size estimates.** A header estimated at 96 px instead of 40 px makes the content jump when real sizes are measured. Estimate per row kind, or let the library measure (`measureElement`).",
            "**Unclamped overscan.** A negative start or an end past the list renders `undefined` rows and throws. Clamp both ends.",
        ]),

        p("Now write the window calculation. The editor holds `menu/virtualWindow.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run calls it at several scroll positions of a 3,000-row list, a menu with two row heights, a filtered menu and an empty list."),
        challenge("chal_coding_fwp_142"),
    ],
});
