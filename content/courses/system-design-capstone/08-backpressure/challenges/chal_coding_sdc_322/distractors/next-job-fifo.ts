// @piece next-job: The next job to grade
const e = this.waiting.exam[0];
const p = this.waiting.practice[0];
const next = e !== undefined && (p === undefined || e.acceptedAt <= p.acceptedAt) ? this.waiting.exam.shift() : this.waiting.practice.shift();
if (next === undefined) return null;
