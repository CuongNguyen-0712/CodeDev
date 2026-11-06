# @piece release-unpaid: Give back the stock of an unpaid checkout
except asyncio.CancelledError:
    if reservation is not None and not paid:
        await deps.stock.release(reservation)
    return {"status": "cancelled"}
