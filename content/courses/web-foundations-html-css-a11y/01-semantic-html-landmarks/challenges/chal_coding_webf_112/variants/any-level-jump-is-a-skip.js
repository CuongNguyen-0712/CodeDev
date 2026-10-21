// Wrong variant: reports any jump of more than one level as a skip, in both directions, so
// closing a subsection (h4 -> h2) is flagged although it is correct.
function auditStructure(root) {
  const outline = [];
  const landmarks = [];
  const issues = [];
  const byId = new Map();
  let mains = 0;

  (function index(node) {
    if (node.attrs?.id && !byId.has(node.attrs.id)) byId.set(node.attrs.id, node);
    (node.children ?? []).forEach(index);
  })(root);

  (function walk(node, ancestors) {
    const heading = /^h([1-6])$/.exec(node.tag);
    if (heading) {
      const level = Number(heading[1]);
      const text = textOf(node);
      const previous = outline.at(-1);
      if (previous && Math.abs(level - previous.level) > 1) {
        issues.push(`skipped-level: h${previous.level} -> h${level} "${text}"`);
      }
      if (text === "") issues.push(`empty-heading: h${level}`);
      outline.push({ level, text });
    }

    const name = accessibleName(node, byId);
    const role = landmarkRole(node.tag, ancestors, name);
    if (role) landmarks.push({ role, name });
    if (node.tag === "main") mains++;

    for (const child of node.children ?? []) walk(child, [...ancestors, node.tag]);
  })(root, []);

  if (!outline.some((h) => h.level === 1)) issues.push("no-h1");
  if (mains === 0) issues.push("no-main");
  if (mains > 1) issues.push(`multiple-main: ${mains}`);
  return { outline, landmarks, issues };
}

const SECTIONING = ["article", "aside", "main", "nav", "section"];

function landmarkRole(tag, ancestors, name) {
  const topLevel = !ancestors.some((a) => SECTIONING.includes(a));
  switch (tag) {
    case "header": return topLevel ? "banner" : null;
    case "footer": return topLevel ? "contentinfo" : null;
    case "nav": return "navigation";
    case "main": return "main";
    case "aside": return "complementary";
    case "section": return name === null ? null : "region";
    case "form": return name === null ? null : "form";
    default: return null;
  }
}

function accessibleName(node, byId) {
  const ids = (node.attrs?.["aria-labelledby"] ?? "").split(/\s+/).filter(Boolean);
  const labelled = ids.filter((id) => byId.has(id)).map((id) => textOf(byId.get(id))).join(" ").trim();
  if (labelled !== "") return labelled;
  const label = (node.attrs?.["aria-label"] ?? "").trim();
  return label === "" ? null : label;
}

function textOf(node) {
  const raw = (n) => (n.text ?? "") + (n.children ?? []).map(raw).join("");
  return raw(node).replace(/\s+/g, " ").trim();
}
