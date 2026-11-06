// @piece race: Wait for the call or the deadline
const result = await Promise.race([fn(controller.signal), timeout]);
clock.clearTimeout(timer);
return result;
