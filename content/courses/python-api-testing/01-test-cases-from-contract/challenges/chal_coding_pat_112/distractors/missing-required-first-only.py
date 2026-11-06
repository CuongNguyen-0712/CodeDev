# @piece missing-required: A case for each required property left out
if required and name == required[0]:
    body = {k: v for k, v in base.items() if k != name}
    cases.append({"id": f"missing-{name}", "body": body, "expect": "rejected"})
