// @piece apply-in-order: Apply the learner's waiting events in sequence
let next = e.learnerSeq;
while (waiting.has(next)) {
    this.score(waiting.get(next)!);
    waiting.delete(next);
    this.applied.set(e.userId, next);
    next++;
}
