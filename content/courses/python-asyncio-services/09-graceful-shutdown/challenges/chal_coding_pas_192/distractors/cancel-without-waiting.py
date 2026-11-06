# @piece cancel-leftovers: Cancel what is still running and wait until it stopped
for task in list(in_flight):
    task.cancel()
