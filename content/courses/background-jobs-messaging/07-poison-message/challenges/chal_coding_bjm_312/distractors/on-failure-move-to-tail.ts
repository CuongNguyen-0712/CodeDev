// @piece on-failure: What happens after a failed attempt
// let the others go first: move the failing message to the tail and retry it later
w.queue.shift();
w.queue.push(head);
