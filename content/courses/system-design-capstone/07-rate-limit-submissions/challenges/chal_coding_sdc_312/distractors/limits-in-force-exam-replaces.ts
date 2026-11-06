// @piece limits-in-force: The capacity and refill rate in force right now
const exam = this.config.examDay;
let capacity = limit.capacity;
let perSec = limit.refillPerSec;
if (exam !== null && exam.fromMs <= now && now < exam.toMs) {
    capacity = exam.capacity;
    perSec = exam.refillPerSec;
}
return { capacity: capacity * TOKEN, rate: Math.round(perSec * 1000) };
