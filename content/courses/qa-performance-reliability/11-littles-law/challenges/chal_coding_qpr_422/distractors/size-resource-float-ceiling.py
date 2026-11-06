# @piece size-resource: How busy one resource is, and the size it needs
needed = x * res["hold_ms"] / 1000
utilization = needed * 100 / res["size"]
if needed > res["size"]:
    findings.append(f"over_capacity:{res['name']}")
elif utilization > target:
    findings.append(f"above_target:{res['name']}")
sized.append({"name": res["name"], "needed": round(float(needed), 1),
              "utilization_pct": round(float(utilization), 1),
              "min_size": math.ceil(float(needed) / (target / 100))})
