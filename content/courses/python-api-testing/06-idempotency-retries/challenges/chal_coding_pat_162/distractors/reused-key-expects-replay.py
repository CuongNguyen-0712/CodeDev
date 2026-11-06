# @piece check-reused-key: The same key with another body is refused
first = api.post("/orders", json=ORDER, headers={"Idempotency-Key": "k-reused"})
other = dict(ORDER, items=[{"dish": "pho-bo", "qty": 1}])
response = api.post("/orders", json=other, headers={"Idempotency-Key": "k-reused"})
assert response.status_code == 201 and response.json() == first.json(), f"reused key -> {response.status_code}"
