# @piece run-together: Run the three calls together as one group
try:
    order = asyncio.ensure_future(api.order(order_id))
    courier = asyncio.ensure_future(courier_or_none(api, order_id))
    eta = asyncio.ensure_future(api.restaurant_eta(order_id))
    await asyncio.gather(order, courier, eta)
