# @piece customer-teardown: Remove the customer and its orders, even on failure
try:
    yield created
finally:
    api.delete(f"/customers/{created['id']}")
    for order in api.get(f"/orders?customer_id={created['id']}")[1]:
        api.delete(f"/orders/{order['id']}")
