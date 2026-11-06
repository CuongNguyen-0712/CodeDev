// @piece checkpoint: Run callbacks safely and drain the microtasks
function runGuarded(cb, onError) {
  try {
    cb();
  } catch (error) {
    onError(error);
  }
}

function checkpoint(onError) {
  const batch = microtasks.splice(0, microtasks.length);
  for (const cb of batch) runGuarded(cb, onError);
}
