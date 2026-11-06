# @piece guarded-call: One partner call, holding a slot
async with asyncio.Semaphore(limit):
    return await partners.menu(restaurant_id)
