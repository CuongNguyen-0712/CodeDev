// @piece accept-event: Classify the event and keep an accepted one waiting
const e = parse(raw);
if (!e) return "invalid";
const last = this.applied.get(e.userId) ?? 0;
const waiting = this.buffered.get(e.userId) ?? new Map<number, GoodEvent>();
if (e.learnerSeq <= last || waiting.has(e.learnerSeq)) return "stale";
this.seen.add(e.eventId);
waiting.set(e.learnerSeq, e);
this.buffered.set(e.userId, waiting);
