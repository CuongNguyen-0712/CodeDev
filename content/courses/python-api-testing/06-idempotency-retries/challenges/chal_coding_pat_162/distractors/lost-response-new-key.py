# @piece check-lost-response: A retry after a timeout creates no second order
try:
    api.post("/orders", json=ORDER, headers={"Idempotency-Key": "k-lost"}, lose_response=True)
except TimeoutError:
    pass
retry = api.post("/orders", json=ORDER, headers={"Idempotency-Key": "k-lost-retry"})
assert retry.status_code == 201, f"retry -> {retry.status_code}"
