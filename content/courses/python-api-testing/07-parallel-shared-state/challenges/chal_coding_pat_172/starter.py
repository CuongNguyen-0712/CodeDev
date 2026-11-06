"""
Helpers every Rice Rocket API test uses (tests/helpers.py), now that CI runs the suite with
pytest-xdist (`pytest -n 4`): several worker processes (gw0, gw1, ...) run tests at the same time
against the same staging API.

ctx describes the running test: ctx["worker_id"] ("gw0", ...), ctx["test_name"] ("test_receipt")
and ctx["tmp_dir"] (pytest's tmp_path: a fresh directory per test and worker). With
`--dist each` every worker runs every test, so the same test name runs on several workers at once.

The staging API (api.post / api.get return (status, body)):
  POST /customers {email}           201 {id} | 409 email already used
  POST /couriers {name}             201 {id}
  POST /orders {customer_id}        201 {id}
  POST /orders/<id>/accept {courier_id}   200 | 409 courier is busy with another delivery
  POST /orders/<id>/deliver          200 (the courier is free again)
  GET  /orders | /orders?customer_id=<id>   200 [orders]
Courier 1 is the seeded demo courier. `files` is the CI machine's disk: files[path] = text.

Every helper must give the same result whether the test runs alone or next to other workers.
"""
import json
import sys


def namespace(ctx):
    """A prefix for everything this test creates."""
    # [ ] A prefix unique to this worker and this test


def new_customer(api, ctx):
    """A fresh customer for this test."""
    status, body = api.post("/customers", {"email": f"qa+{namespace(ctx)}@ricerocket.test"})
    assert status == 201, f"POST /customers -> {status} {body}"
    return body["id"]


def courier_for(api, ctx):
    """The courier this test assigns deliveries to."""
    # [ ] A courier no other running test can use


def my_order_count(api, customer_id):
    """How many orders this test's customer has."""
    # [ ] Count only the orders this test created


def artifact_path(ctx, name):
    """Where this test writes a file it reads back later."""
    # [ ] A file path no other test writes to


# ---------------------------------------------------------------- test runner (do not change)
# A small pytest-xdist: tests are handed to the workers in turn, and the workers advance one step
# each in turn, so their requests interleave the way they do on CI.
class Api:
    def __init__(self):
        self.customers, self.couriers, self.orders, self.next_id = {}, {1: None}, {}, 100

    def _id(self):
        self.next_id += 1
        return self.next_id

    def post(self, path, body):
        parts = path.strip("/").split("/")
        if path == "/customers":
            if body["email"] in self.customers.values():
                return 409, {"detail": "email already used"}
            i = self._id()
            self.customers[i] = body["email"]
            return 201, {"id": i}
        if path == "/couriers":
            i = self._id()
            self.couriers[i] = None
            return 201, {"id": i}
        if path == "/orders":
            i = self._id()
            self.orders[i] = {"id": i, "customer_id": body["customer_id"]}
            return 201, {"id": i}
        order_id, action = int(parts[1]), parts[2]
        if action == "accept":
            if self.couriers.get(body["courier_id"]) is not None:
                return 409, {"detail": "courier is busy with another delivery"}
            self.couriers[body["courier_id"]] = order_id
            self.orders[order_id]["courier_id"] = body["courier_id"]
            return 200, {}
        courier = self.orders[order_id].get("courier_id")
        self.couriers[courier] = None
        return 200, {}

    def get(self, path):
        if "?" not in path:
            return 200, list(self.orders.values())
        customer = int(path.split("=")[1])
        return 200, [o for o in self.orders.values() if o["customer_id"] == customer]


def test_courier_accepts_order(api, files, ctx):
    customer = new_customer(api, ctx)
    courier = courier_for(api, ctx)
    yield
    _, order = api.post("/orders", {"customer_id": customer})
    status, body = api.post(f"/orders/{order['id']}/accept", {"courier_id": courier})
    assert status == 200, f"accept -> {status} {body}"
    yield
    status, _ = api.post(f"/orders/{order['id']}/deliver", {})
    assert status == 200


def test_order_history(api, files, ctx):
    customer = new_customer(api, ctx)
    api.post("/orders", {"customer_id": customer})
    api.post("/orders", {"customer_id": customer})
    yield
    count = my_order_count(api, customer)
    assert count == 2, f"expected 2 orders in the history, found {count}"


def test_receipt(api, files, ctx):
    customer = new_customer(api, ctx)
    _, order = api.post("/orders", {"customer_id": customer})
    path = artifact_path(ctx, "receipt.txt")
    files[path] = f"receipt for order {order['id']}"
    yield
    assert files[path] == f"receipt for order {order['id']}", f"read back: {files[path]!r}"


TESTS = {"test_courier_accepts_order": test_courier_accepts_order, "test_order_history": test_order_history, "test_receipt": test_receipt}

if __name__ == "__main__":
    case = json.load(sys.stdin)
    api, files = Api(), {}
    n = case["workers"]
    if case.get("dist") == "each":
        workers = [list(case["order"]) for _ in range(n)]
    else:
        workers = [[] for _ in range(n)]
        for k, name in enumerate(case["order"]):
            workers[k % n].append(name)
    results, running = {}, [None] * n
    while any(workers) or any(running):
        for w in range(n):
            if running[w] is None:
                if not workers[w]:
                    continue
                name = workers[w].pop(0)
                ctx = {"worker_id": f"gw{w}", "test_name": name, "tmp_dir": f"/tmp/pytest-of-ci/popen-gw{w}/{name}0"}
                running[w] = (f"{name}@gw{w}", TESTS[name](api, files, ctx))
            test_id, gen = running[w]
            try:
                next(gen)
                continue
            except StopIteration:
                results[test_id] = "passed"
            except Exception as error:
                results[test_id] = f"failed: {error}"
            running[w] = None
    print(json.dumps({"results": dict(sorted(results.items()))}))
