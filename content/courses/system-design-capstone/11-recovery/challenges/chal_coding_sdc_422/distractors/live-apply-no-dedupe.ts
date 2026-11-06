// @piece live-apply: Apply a new event once to the live board
if (this.status !== "ready") return;
this.apply(this.live, event);
this.appliedSeq = event.seq;
