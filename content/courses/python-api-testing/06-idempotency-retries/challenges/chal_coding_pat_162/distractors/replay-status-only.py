# @piece check-replay: A repeated request returns the first answer again
first = api.post("/orders", json=ORDER, headers={"Idempotency-Key": "k-replay"})
again = api.post("/orders", json=ORDER, headers={"Idempotency-Key": "k-replay"})
assert first.status_code == 201, f"first request -> {first.status_code}"
assert again.status_code == first.status_code, f"replay -> {again.status_code}"
