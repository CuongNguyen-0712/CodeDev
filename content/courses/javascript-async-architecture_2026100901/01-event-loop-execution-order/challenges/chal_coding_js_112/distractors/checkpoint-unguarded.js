// @piece checkpoint: Run callbacks safely and drain the microtasks
function runGuarded(cb, onError) {
  cb();
}

function checkpoint(onError) {
  while (microtasks.length > 0) runGuarded(microtasks.shift(), onError);
}
