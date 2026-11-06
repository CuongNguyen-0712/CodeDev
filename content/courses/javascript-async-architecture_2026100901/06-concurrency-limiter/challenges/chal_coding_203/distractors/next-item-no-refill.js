// @piece next-item: Free the slot, then finish or start the next item
  .then(() => {
    running -= 1;
    finished += 1;
    if (failed) return;
    if (finished === items.length) resolve(results);
  });
