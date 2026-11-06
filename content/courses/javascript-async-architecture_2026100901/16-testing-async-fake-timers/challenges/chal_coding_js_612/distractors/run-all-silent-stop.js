// @piece run-all: Fire everything pending, within the limit
let fired = 0;
while (timers.size > 0 && fired < limit) {
  fire(nextDue(Infinity));
  fired++;
}
return fired;
