# @piece own-restaurant: A restaurant only this test uses, removed after it
created = {"id": 1}
try:
    yield created
finally:
    for order in api.get(f"/orders?restaurant_id={created['id']}")[1]:
        api.delete(f"/orders/{order['id']}")
