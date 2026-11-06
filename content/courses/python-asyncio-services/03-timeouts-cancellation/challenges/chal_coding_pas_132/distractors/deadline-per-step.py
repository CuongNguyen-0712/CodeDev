# @piece deadline: One time budget for reserving and charging
async with asyncio.timeout(2.0):
    reservation = await deps.stock.reserve(order["id"])
async with asyncio.timeout(2.0):
    charge = await deps.payments.charge(order["id"], order["amount"])
