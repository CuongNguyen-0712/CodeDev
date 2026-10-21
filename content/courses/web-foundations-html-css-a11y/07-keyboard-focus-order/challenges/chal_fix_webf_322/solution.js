/**
 * Reference solution (never shipped to learners).
 */
function tabOrder(root) {
  const NATIVE = ["a", "button", "select", "textarea", "input"];
  const CONTROLS = ["button", "input", "select", "textarea"];
  const positive = [];
  const zero = [];

  function visit(node) {
    const { tag, attrs } = node;
    if (attrs.hidden || attrs.inert) return; // the whole subtree is out

    const native =
      NATIVE.includes(tag) &&
      !(tag === "input" && attrs.type === "hidden") &&
      !(tag === "a" && attrs.href === undefined); // a link only with an href
    const disabled = attrs.disabled === true && CONTROLS.includes(tag);
    // tabindex is an attribute string: compare numbers, not strings ("10" < "2")
    const tabindex = attrs.tabindex !== undefined ? Number(attrs.tabindex) : native ? 0 : null;

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
