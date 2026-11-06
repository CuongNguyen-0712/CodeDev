// @piece race: Wait for the call or the deadline
return Promise.race([fn(controller.signal), timeout]);
