// @piece rank: Rank the models that fit
fitting.sort(
    (a, b) =>
        (b.quality ?? 0) - (a.quality ?? 0) ||
        costPer1k(task, a) - costPer1k(task, b) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
);
