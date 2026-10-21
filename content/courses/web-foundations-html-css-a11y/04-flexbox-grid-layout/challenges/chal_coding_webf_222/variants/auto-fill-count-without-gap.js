// Wrong: the auto-fill/auto-fit count is floor(width / min), which ignores that every extra
// track also needs a gap. At 700px with minmax(220px, 1fr) and a 24px gap it finds 3 columns,
// but 3 * 220 + 2 * 24 = 708px does not fit.
function gridColumns({ template, width, gap, items }) {
  const round = (x) => Math.round(x * 100) / 100;
  const auto = /^repeat\((auto-fill|auto-fit), minmax\((\d+(?:\.\d+)?)px, 1fr\)\)$/.exec(template);

  if (auto) {
    const min = Number(auto[2]);
    const count = Math.max(1, Math.floor(width / min));
    const used = auto[1] === "auto-fit" ? Math.min(items, count) : count;
    const size = round(Math.max(min, (width - (used - 1) * gap) / used));
    return Array.from({ length: count }, (_, i) => (i < used ? size : 0));
  }

  const tracks = template.split(" ").map((token) => {
    const [, n, unit] = /^(\d+(?:\.\d+)?)(px|%|fr)$/.exec(token);
    const value = Number(n);
    return unit === "fr" ? { fr: value } : { px: unit === "%" ? (width * value) / 100 : value };
  });

  const fixed = tracks.reduce((sum, t) => sum + (t.px ?? 0), 0);
  const totalFr = tracks.reduce((sum, t) => sum + (t.fr ?? 0), 0);
  const free = Math.max(0, width - fixed - (tracks.length - 1) * gap);
  return tracks.map((t) => round(t.fr ? (free * t.fr) / totalFr : t.px));
}
