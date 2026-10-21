// Wrong: the fr tracks share width minus the fixed tracks, but the gaps are never subtracted,
// so the columns add up to more than the container and the grid overflows by (n - 1) * gap.
function gridColumns({ template, width, gap, items }) {
  const round = (x) => Math.round(x * 100) / 100;
  const auto = /^repeat\((auto-fill|auto-fit), minmax\((\d+(?:\.\d+)?)px, 1fr\)\)$/.exec(template);

  if (auto) {
    const min = Number(auto[2]);
    const count = Math.max(1, Math.floor((width + gap) / (min + gap)));
    const used = auto[1] === "auto-fit" ? Math.min(items, count) : count;
    const size = round(Math.max(min, width / used));
    return Array.from({ length: count }, (_, i) => (i < used ? size : 0));
  }

  const tracks = template.split(" ").map((token) => {
    const [, n, unit] = /^(\d+(?:\.\d+)?)(px|%|fr)$/.exec(token);
    const value = Number(n);
    return unit === "fr" ? { fr: value } : { px: unit === "%" ? (width * value) / 100 : value };
  });

  const fixed = tracks.reduce((sum, t) => sum + (t.px ?? 0), 0);
  const totalFr = tracks.reduce((sum, t) => sum + (t.fr ?? 0), 0);
  const free = Math.max(0, width - fixed);
  return tracks.map((t) => round(t.fr ? (free * t.fr) / totalFr : t.px));
}
