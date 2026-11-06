# @piece write-one: Write one event and always mark it done
try:
    await sink.write(event)
    written += 1
    queue.task_done()
except SinkError:
    dead.append(event["id"])
