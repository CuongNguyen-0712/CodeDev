"""
Fixtures of Rice Rocket's API test suite (tests/conftest.py), written as pytest yield fixtures:
everything before `yield` is setup, everything after it is teardown, and pytest runs the teardown
even when the test fails. A test that asks for (restaurant, customer) gets restaurant set up first
and torn down last.

The staging API (`api` below, an httpx-like client: api.post / api.patch / api.delete / api.get
return (status, body)) enforces:
  POST   /customers {email, name}            201 {id} | 409 email already used
  DELETE /customers/<id>                     204 | 409 while the customer still has orders
  POST   /restaurants {name, open}           201 {id}
  DELETE /restaurants/<id>                   204 | 409 while the restaurant still has orders
  GET    /orders?customer_id=<id> | ?restaurant_id=<id>   200 [orders]
  DELETE /orders/<id>                        204
Restaurant 1 is shared seed data used by the web team's demo; tests must not depend on its state.

`run` holds this CI run: run["run_id"] (unique per CI job) and run["seq"]() (1, 2, 3, ... per call).
Every fixture must leave nothing behind, whatever order the tests run in and whether they pass.
"""
import json
import sys


def customer(api, run):
    # @piece unique-email: An email no other test, run or retry can hold
    email = f"qa+{run['run_id']}-{run['seq']()}@ricerocket.test"
    # @end
    status, body = api.post("/customers", {"email": email, "name": "QA Customer"})
    assert status == 201, f"POST /customers -> {status} {body}"
    created = {"id": body["id"], "email": email}
    # @piece customer-teardown: Remove the customer and its orders, even on failure
    try:
        yield created
    finally:
        for order in api.get(f"/orders?customer_id={created['id']}")[1]:
            api.delete(f"/orders/{order['id']}")
        api.delete(f"/customers/{created['id']}")
    # @end


def restaurant(api, run):
    # @piece own-restaurant: A restaurant only this test uses, removed after it
    status, body = api.post("/restaurants", {"name": f"QA Kitchen {run['run_id']}-{run['seq']()}", "open": True})
    assert status == 201, f"POST /restaurants -> {status} {body}"
    created = {"id": body["id"]}
    try:
        yield created
    finally:
        for order in api.get(f"/orders?restaurant_id={created['id']}")[1]:
            api.delete(f"/orders/{order['id']}")
        api.delete(f"/restaurants/{created['id']}")
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# A tiny pytest: runs the scripted tests below in the order given on stdin, sets fixtures up in
# argument order, tears them down in reverse order (also when the test fails) and reports the
# results and whatever the run left in the staging API.
class Api:
    def __init__(self, leftovers):
        self.customers, self.restaurants, self.orders, self.next_id = {}, {1: {"open": True, "seed": True}}, {}, 100
        for c in leftovers:
            self.customers[self._id()] = {"email": c["email"]}

    def _id(self):
        self.next_id += 1
        return self.next_id

    def post(self, path, body):
        if path == "/customers":
            if any(c["email"] == body["email"] for c in self.customers.values()):
                return 409, {"detail": f"email {body['email']} is already used"}
            i = self._id()
            self.customers[i] = {"email": body["email"]}
            return 201, {"id": i}
        if path == "/restaurants":
            i = self._id()
            self.restaurants[i] = {"open": body.get("open", True)}
            return 201, {"id": i}
        if path == "/orders":
            if body["customer_id"] not in self.customers or body["restaurant_id"] not in self.restaurants:
                return 422, {"detail": "unknown customer or restaurant"}
            if not self.restaurants[body["restaurant_id"]]["open"]:
                return 409, {"detail": "restaurant is closed"}
            i = self._id()
            self.orders[i] = {"customer_id": body["customer_id"], "restaurant_id": body["restaurant_id"]}
            return 201, {"id": i}
        return 404, {}

    def patch(self, path, body):
        rid = int(path.rsplit("/", 1)[1])
        if rid not in self.restaurants:
            return 404, {}
        self.restaurants[rid].update(body)
        return 200, {"id": rid}

    def get(self, path):
        key, value = path.split("?", 1)[1].split("=")
        return 200, [{"id": i, **o} for i, o in self.orders.items() if o[key] == int(value)]

    def delete(self, path):
        kind, i = path.strip("/").split("/")
        i = int(i)
        if kind == "orders":
            self.orders.pop(i, None)
        elif kind == "customers":
            if any(o["customer_id"] == i for o in self.orders.values()):
                return 409, {"detail": "customer has orders"}
            self.customers.pop(i, None)
        elif kind == "restaurants":
            if any(o["restaurant_id"] == i for o in self.orders.values()):
                return 409, {"detail": "restaurant has orders"}
            self.restaurants.pop(i, None)
        return 204, None


def test_place_order(api, restaurant, customer):
    status, body = api.post("/orders", {"customer_id": customer["id"], "restaurant_id": restaurant["id"]})
    assert status == 201, f"order -> {status} {body}"


def test_closed_restaurant_rejects_orders(api, restaurant, customer):
    api.patch(f"/restaurants/{restaurant['id']}", {"open": False})
    status, _ = api.post("/orders", {"customer_id": customer["id"], "restaurant_id": restaurant["id"]})
    assert status == 409, f"closed restaurant accepted an order ({status})"


def test_email_is_unique(api, customer):
    status, _ = api.post("/customers", {"email": customer["email"], "name": "Copy"})
    assert status == 409, f"duplicate email -> {status}"


def test_reorder(api, restaurant, customer):
    for _ in range(2):
        status, body = api.post("/orders", {"customer_id": customer["id"], "restaurant_id": restaurant["id"]})
        assert status == 201, f"order -> {status} {body}"


TESTS = {
    "test_place_order": (test_place_order, ["restaurant", "customer"]),
    "test_closed_restaurant_rejects_orders": (test_closed_restaurant_rejects_orders, ["restaurant", "customer"]),
    "test_email_is_unique": (test_email_is_unique, ["customer"]),
    "test_reorder": (test_reorder, ["restaurant", "customer"]),
}
FIXTURES = {"customer": customer, "restaurant": restaurant}


def run_suite(case, api, run_id):
    counter = {"n": 0}

    def seq():
        counter["n"] += 1
        return counter["n"]

    run = {"run_id": run_id, "seq": seq}
    results = {}
    for name in case["order"]:
        func, wanted = TESTS[name]
        active, values, outcome = [], {}, "passed"
        try:
            for fixture in wanted:
                gen = FIXTURES[fixture](api, run)
                values[fixture] = next(gen)
                active.append(gen)
            func(api, **values)
            if name in case.get("crash", []):
                raise AssertionError("simulated failure after the request")
        except Exception as error:
            outcome = f"failed: {error}"
        for gen in reversed(active):
            try:
                next(gen)
            except StopIteration:
                pass
            except Exception as error:
                outcome = f"error in teardown: {error}"
        results[name] = outcome
    return results


if __name__ == "__main__":
    case = json.load(sys.stdin)
    api = Api(case.get("leftovers", []))
    runs = []
    for run_id in case["runs"]:
        runs.append(run_suite(case, api, run_id))
    left = {
        "customers": len(api.customers) - len(case.get("leftovers", [])),
        "orders": len(api.orders),
        "restaurants": len(api.restaurants) - 1,
        "seed_restaurant_open": api.restaurants.get(1, {}).get("open"),
    }
    print(json.dumps({"runs": runs, "left_behind": left}))
