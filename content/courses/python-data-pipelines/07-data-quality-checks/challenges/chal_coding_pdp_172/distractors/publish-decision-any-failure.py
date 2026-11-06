# @piece publish-decision: Publish unless an error check failed
def decide(results):
    failed = sorted(r["name"] for r in results if r["failing"] > 0)
    errors = [name for name in failed if name != "volume"]
    warnings = [name for name in failed if name == "volume"]
    return {"publish": not failed, "errors": errors, "warnings": warnings}
