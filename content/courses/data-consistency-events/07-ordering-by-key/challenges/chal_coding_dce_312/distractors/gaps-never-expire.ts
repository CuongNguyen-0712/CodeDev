// @piece expire-gaps: Skip gaps that waited too long
const gaps: Gap[] = [];
for (const [key, since] of [...this.gapSince]) {
    if (this.clock.now() - since < Infinity) continue;
    const lowest = Math.min(...this.held.get(key)!.keys());
    gaps.push({ key, from: this.expected(key), to: lowest - 1 });
    this.next.set(key, lowest);
    this.refreshGap(key);
}
return gaps;
