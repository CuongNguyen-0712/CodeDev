"""
Idempotency checks for Rice Rocket's POST /orders (tests/test_idempotency.py).

The API contract (after the IETF draft "The Idempotency-Key HTTP Header Field"):
  POST /orders without an Idempotency-Key header         -> 400
  first request with key K                               -> 201 {"id": ...}
  same K, same body, after the first one finished        -> the SAME status and body again,
                                                            plus the header Idempotent-Replayed: true
  same K, a different body                               -> 422 (the key was reused for another request)
  same K while the first request is still being handled  -> 409 (retry later)
  a retry after a lost response (client timeout) with K  -> the original order, never a second one

`api` is an httpx-like client: api.post(path, json=..., headers=...) returns a response with
.status_code, .json() and .headers; api.start(...) sends a request and returns a handle without
waiting for it, api.finish(handle) waits for its response; api.post(..., lose_response=True) lets
the server handle the request and then raises TimeoutError, as a mobile client on a bad network
sees it; api.get("/orders?customer_id=<id>") lists the customer's orders.

Each check raises AssertionError with a message when the API breaks the contract. run_checks runs
every check on a fresh API and returns the names of the failed checks, sorted.
"""
import json
import sys

ORDER = {"customer_id": 7, "restaurant_id": 42, "items": [{"dish": "com-tam", "qty": 2}]}


def check_replay(api):
    """Same key and body twice: the same answer, marked as a replay."""
    # [ ] A repeated request returns the first answer again


def check_reused_key(api):
    """Same key, different body: 422."""
    # [ ] The same key with another body is refused


def check_in_flight(api):
    """Same key while the first request runs: 409, then the first finishes with 201."""
    # [ ] A duplicate while the first is in progress waits


def check_lost_response(api):
    """Response lost, retried with the same key: still one order."""
    # [ ] A retry after a timeout creates no second order


def check_missing_key(api):
    """No Idempotency-Key header: 400."""
    # [ ] A request without a key is refused


CHECKS = [check_replay, check_reused_key, check_in_flight, check_lost_response, check_missing_key]


def run_checks(make_api):
    failed = []
    for check in CHECKS:
        try:
            check(make_api())
        except AssertionError:
            failed.append(check.__name__)
    return sorted(failed)


# ---------------------------------------------------------------- test runner (do not change)
# Fake order APIs: one that follows the contract and several with one known defect each.
class Response:
    def __init__(self, status_code, body, headers=None):
        self.status_code, self._body, self.headers = status_code, body, headers or {}

    def json(self):
        return self._body


class FakeOrdersApi:
    def __init__(self, defect=None):
        self.defect, self.orders, self.keys, self.in_flight, self.next_id = defect, [], {}, {}, 9000

    def _create(self, body):
        self.next_id += 1
        self.orders.append({"id": self.next_id, **body})
        return Response(201, {"id": self.next_id, "status": "placed"})

    def _handle(self, body, key, finishing=False):
        d = self.defect
        if key is None:
            return self._create(body) if d == "missing-key-accepted" else Response(400, {"detail": "Idempotency-Key is required"})
        if d == "no-idempotency":
            return self._create(body)
        if key in self.in_flight and not finishing:
            return self._create(body) if d == "no-in-flight-lock" else Response(409, {"detail": "a request with this key is in progress"})
        if key in self.keys:
            stored_body, stored = self.keys[key]
            if stored_body != body and d != "ignores-body":
                return Response(422, {"detail": "Idempotency-Key reused with another request"})
            headers = {} if d == "replay-without-header" else {"Idempotent-Replayed": "true"}
            return Response(stored.status_code, stored.json(), headers)
        response = self._create(body)
        self.keys[key] = (body, response)
        return response

    def post(self, path, json=None, headers=None, lose_response=False):
        key = (headers or {}).get("Idempotency-Key")
        if lose_response:
            if self.defect == "store-after-response":
                self._create(json)          # created, but the key is stored only once the response is sent
            else:
                self._handle(json, key)
            raise TimeoutError("read timeout")
        return self._handle(json, key)

    def start(self, path, json=None, headers=None):
        key = (headers or {}).get("Idempotency-Key")
        self.in_flight[key] = json
        return key

    def finish(self, key):
        body = self.in_flight[key]
        response = self._handle(body, key, finishing=True)
        del self.in_flight[key]
        return response

    def get(self, path):
        customer = int(path.split("=")[1])
        return Response(200, [o for o in self.orders if o["customer_id"] == customer])


if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps({v: run_checks(lambda: FakeOrdersApi(None if v == "correct" else v)) for v in case["variants"]}))
