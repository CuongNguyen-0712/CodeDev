# @piece drain-with-grace: Let running handlers finish, but only for `grace` seconds
if in_flight:
    await asyncio.wait(set(in_flight))
