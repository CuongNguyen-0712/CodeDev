/**
 * Returns the ids of the elements a keyboard user reaches with Tab, in order
 * (the "sequential focus navigation order" of the page).
 *
 * Input: the root of an element tree. Every node is
 *   { id: string, tag: string, attrs: object, children: node[] }
 * attrs and children are always present (possibly empty). Attribute values:
 *   - tabindex: a string holding an integer, e.g. "0", "-1", "2", "10" (absent = no tabindex)
 *   - href, type: strings (an input without type is a text input)
 *   - hidden, inert, disabled: true when the attribute is present, absent otherwise
 *
 * Rules:
 *   1. A node with hidden or inert is skipped together with its WHOLE subtree.
 *   2. Natively focusable: a WITH an href attribute (any value, even ""), button, select,
 *      textarea, and input unless its type is "hidden". Every other tag (div, span, a
 *      without href, ...) is not natively focusable.
 *   3. disabled on button, input, select or textarea makes that element unfocusable, even
 *      when it has a tabindex. On any other tag, disabled has no effect.
 *   4. An element with a tabindex uses its number: below 0 = focusable by script only, so
 *      NOT in the Tab sequence (its children are still checked); 0 or more = in the
 *      sequence, whatever its tag. An element without tabindex is in the sequence with
 *      the value 0 if it is natively focusable.
 *   5. Order: first every element with a value greater than 0, in ascending NUMERIC order
 *      (equal values in document order), then every element with the value 0, in document
 *      order. Document order = depth-first, a parent before its children, children in
 *      array order. The root itself counts like any other node.
 *
 * Output: an array of ids, e.g. ["email", "newsletter", "logo", ...]; [] if nothing is focusable.
 *
 * BUG: a keyboard-only customer reports that Tab jumps from the email field to the footer.
 * Our audit script (this function) does not even agree with the browser: it lists the links
 * of the closed mini-cart drawer and the current breadcrumb item, which the browser never
 * focuses, and on the account page it put tabindex="10" before tabindex="2".
 *
 * @param {{ id: string, tag: string, attrs: object, children: object[] }} root
 * @returns {string[]}
 */
function tabOrder(root) {
  const NATIVE = ["a", "button", "select", "textarea", "input"];
  const CONTROLS = ["button", "input", "select", "textarea"];
  const positive = [];
  const zero = [];

  function visit(node) {
    const { tag, attrs } = node;
    if (attrs.hidden) return;

    const native = NATIVE.includes(tag) && !(tag === "input" && attrs.type === "hidden");
    const disabled = attrs.disabled === true && CONTROLS.includes(tag);
    const tabindex = attrs.tabindex !== undefined ? attrs.tabindex : native ? "0" : null;

    if (!disabled && tabindex !== null && tabindex >= 0) {
      if (tabindex > 0) positive.push({ id: node.id, tabindex });
      else zero.push(node.id);
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  positive.sort((a, b) => (a.tabindex < b.tabindex ? -1 : a.tabindex > b.tabindex ? 1 : 0));
  return [...positive.map((p) => p.id), ...zero];
}
