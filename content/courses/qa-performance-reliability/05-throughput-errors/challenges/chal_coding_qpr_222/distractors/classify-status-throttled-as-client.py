# @piece classify-status: The class of one response status
def classify(status):
    if 200 <= status <= 399:
        return "ok"
    if 400 <= status <= 499:
        return "client_errors"
    return "errors"  # 5xx, and 0 = no response
