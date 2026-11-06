// @piece finish-call: Hand the result to the waiters and forget the finished call
cl.value, cl.err = value, err
close(cl.done)
