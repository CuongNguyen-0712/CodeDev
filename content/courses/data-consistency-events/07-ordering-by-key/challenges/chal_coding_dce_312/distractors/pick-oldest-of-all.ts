// @piece pick-next: Choose the next event to hand out
let best: { msg: Message; n: number } | null = null;
for (const queue of this.held.values()) {
    for (const entry of queue.values()) if (!best || entry.n < best.n) best = entry;
}
if (!best) return null;
if (this.busy.has(best.msg.key) || best.msg.seq !== this.expected(best.msg.key)) return null;
