# @piece fetch-until-stop: Fetch the next message, unless stop comes first
if stop.is_set():
    break
message = await source.get()
