# @piece work-then-ack: Handle the message, then acknowledge it
await source.ack(message["id"])
await handle(message)
