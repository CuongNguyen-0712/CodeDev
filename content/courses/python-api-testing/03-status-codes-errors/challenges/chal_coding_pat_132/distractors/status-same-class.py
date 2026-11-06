# @piece status-exact: The status code the contract promises
if status // 100 != expected["status"] // 100:
    return [f"status: expected {expected['status']}, got {status}"]
