# @piece drain-and-stop: Wait for the buffer to drain, then stop the writers
for task in tasks:
    task.cancel()
await asyncio.gather(*tasks, return_exceptions=True)
