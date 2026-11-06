// @piece hand-out: Hand it out and keep its key busy
const { key, seq } = best.msg;
this.held.get(key)!.delete(seq);
this.busy.add(key);
return best.msg;
