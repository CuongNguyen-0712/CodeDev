/**
 * Audit the structure of a page the way a screen reader sees it: its heading outline, its
 * landmarks, and the structural problems a reviewer should fix.
 *
 * INPUT: the parsed page as a tree of plain objects (no DOM in this exercise):
 *   { tag: "h2", attrs: { id: "deals", class: "title" }, text: "Today's deals", children: [ ... ] }
 *   - tag       lower-case element name ("body", "header", "h2", "a", ...)
 *   - attrs     attributes as strings (optional, may be missing)
 *   - text      the element's own text, which comes BEFORE its children (optional)
 *   - children  child elements in document order (optional)
 * Walk the tree in document order: an element first, then its children, depth-first.
 * Use textOf(node) (below) for the text of an element and everything inside it.
 *
 * 1. outline: one { level, text } per h1-h6 element, in document order.
 *    level = the digit in the tag (h3 -> 3). Nesting inside <section> does NOT change it.
 *    text  = textOf(heading) ("" for an empty heading - it still goes in the outline).
 *    Only h1-h6 tags count; role attributes are ignored by this checker.
 *
 * 2. landmarks: one { role, name } per landmark element, in document order.
 *      header  -> "banner"        only when it has NO ancestor article, aside, main, nav or section
 *      footer  -> "contentinfo"   same rule as header
 *      nav     -> "navigation"
 *      main    -> "main"
 *      aside   -> "complementary"
 *      section -> "region"        only when it has a name
 *      form    -> "form"          only when it has a name
 *    Any other element (div, article, ...) is not a landmark. Role attributes are ignored.
 *    name (string, or null when there is none):
 *      a. aria-labelledby: a space-separated list of ids. Take textOf() of each element in the
 *         page with that id (skip ids that do not exist), join them with one space, trim.
 *         If the result is not "", that is the name.
 *      b. otherwise aria-label, trimmed, if it is not "".
 *      c. otherwise null.
 *
 * 3. issues: an array of strings, in this order:
 *    a. For each heading in outline order (except the first heading of the page):
 *         - if level > previous heading's level + 1:  'skipped-level: h2 -> h4 "Shipping"'
 *           (previous level, this level, this heading's text in double quotes)
 *       then, for every heading (the first one too):
 *         - if its text is "":                         "empty-heading: h3"
 *       Going back to a lower number (h4 -> h2) is never an issue.
 *    b. "no-h1" if the outline has no level-1 heading.
 *    c. "no-main" if the page has no <main>, or "multiple-main: 3" if it has more than one.
 *
 * Example: <body><main><h2>Cart</h2><h4></h4></main></body> returns
 *   { outline: [{ level: 2, text: "Cart" }, { level: 4, text: "" }],
 *     landmarks: [{ role: "main", name: null }],
 *     issues: ['skipped-level: h2 -> h4 ""', "empty-heading: h4", "no-h1"] }
 *
 * @param {{ tag: string, attrs?: Object<string, string>, text?: string, children?: object[] }} root
 * @returns {{ outline: { level: number, text: string }[],
 *             landmarks: { role: string, name: string | null }[],
 *             issues: string[] }}
 */
function auditStructure(root) {
  const outline = [];
  const landmarks = [];
  const issues = [];

  // TODO: walk the tree from root (keep track of the ancestor tags), fill outline and
  // landmarks, then add the issues.

  return { outline, landmarks, issues };
}

// Text of an element and everything inside it, like the DOM's textContent: its own text, then
// its children's text, with every run of whitespace collapsed to one space and the ends trimmed.
function textOf(node) {
  const raw = (n) => (n.text ?? "") + (n.children ?? []).map(raw).join("");
  return raw(node).replace(/\s+/g, " ").trim();
}
