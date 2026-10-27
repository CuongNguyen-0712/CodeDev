"""
Predict what the PostgreSQL planner will estimate for a WHERE clause, from pg_stats numbers,
and which index (if any) it would pick - simplified from the planner's selectivity functions.

case = {"table": str, "rows": table row count,
        "stats": {column: {"null_frac", "n_distinct", "most_common_vals", "most_common_freqs",
                           "histogram_bounds"}},   # a column missing here was never analyzed
        "where": [{"column", "op", "value"}],      # predicates joined by AND
        "indexes": [{"name", "columns"}]}

Selectivity of one predicate (s = the column's stats, mcv / mcf = most_common_vals / _freqs,
missing lists count as empty):
  nd    = n_distinct if n_distinct > 0, else -n_distinct * rows
  rest  = max(0, 1 - sum(mcf) - null_frac)           # share of rows outside the MCV list and NULLs
  "="       v in mcv: its frequency; otherwise rest / max(1, nd - len(mcv))
  "IS NULL" null_frac
  "<" v     sum of mcf whose value < v  + rest * frac(v)
  ">" v     sum of mcf whose value > v  + rest * (1 - frac(v))
  "BETWEEN" [lo, hi]: sum of mcf with lo <= value <= hi + rest * (frac(hi) - frac(lo))
  frac(x) = share of the histogram below x: bounds b0..bk (k equal-depth buckets);
            x <= b0 -> 0; x >= bk -> 1; otherwise, with i the last bound <= x,
            (i + (x - b_i) / (b_{i+1} - b_i)) / k
            no histogram (null or fewer than 2 bounds): "<" and ">" use 0.5 for frac and its
            complement; BETWEEN uses 0.005 for frac(hi) - frac(lo)
  every selectivity is clamped to [0, 1]
  column without stats: "=" 0.005, "<" / ">" 1/3, "BETWEEN" 0.005, "IS NULL" 0.005
  any other op: {"error": "unsupported operator: <op>"}

estimate(case) returns
  {"selectivities": [per predicate, rounded to 6 decimals],
   "selectivity": product of all of them (independent predicates), rounded to 6 decimals,
   "rows": max(1, floor(product * rows + 0.5)),
   "plan": "Index Scan using <name>" or "Seq Scan"}
  Index choice: an index is usable when a predicate uses its first column; its selectivity is the
  product of the predicates on that column. Take the usable index with the lowest selectivity
  (the first one in the list on a tie). If there is none, or its selectivity is above 0.05
  (SEQ_SCAN_ABOVE), the plan is "Seq Scan". Products use unrounded selectivities.
"""
import json
import math
import sys

SEQ_SCAN_ABOVE = 0.05
DEFAULTS = {"=": 0.005, "<": 1 / 3, ">": 1 / 3, "BETWEEN": 0.005, "IS NULL": 0.005}


def hist_frac(bounds, x):
    k = len(bounds) - 1
    if x <= bounds[0]:
        return 0.0
    if x >= bounds[-1]:
        return 1.0
    i = max(j for j in range(k + 1) if bounds[j] <= x)
    return (i + (x - bounds[i]) / (bounds[i + 1] - bounds[i])) / k


def selectivity(pred, stats, rows):
    op = pred["op"]
    if op not in DEFAULTS:
        raise ValueError(f"unsupported operator: {op}")
    s = stats.get(pred["column"])
    if s is None:
        return DEFAULTS[op]
    if op == "IS NULL":
        return s["null_frac"]
    mcv = s.get("most_common_vals") or []
    mcf = s.get("most_common_freqs") or []
    nd = s["n_distinct"] if s["n_distinct"] > 0 else -s["n_distinct"] * rows
    rest = max(0.0, 1 - sum(mcf) - s["null_frac"])
    bounds = s.get("histogram_bounds") or []
    has_hist = len(bounds) >= 2
    v = pred.get("value")
    if op == "=":
        sel = mcf[mcv.index(v)] if v in mcv else rest / max(1, nd - len(mcv))
    elif op == "<":
        sel = sum(f for m, f in zip(mcv, mcf) if m < v) + rest * (hist_frac(bounds, v) if has_hist else 0.5)
    elif op == ">":
        sel = sum(f for m, f in zip(mcv, mcf) if m > v) + rest * (1 - hist_frac(bounds, v) if has_hist else 0.5)
    else:
        lo, hi = v
        part = hist_frac(bounds, hi) - hist_frac(bounds, lo) if has_hist else 0.005
        sel = sum(f for m, f in zip(mcv, mcf) if lo <= m <= hi) + rest * part
    return min(1.0, max(0.0, sel))


def estimate(case):
    try:
        sels = [selectivity(p, case["stats"], case["rows"]) for p in case["where"]]
    except ValueError as error:
        return {"error": str(error)}
    total = math.prod(sels)
    best = None
    for index in case["indexes"]:
        on_lead = [s for p, s in zip(case["where"], sels) if p["column"] == index["columns"][0]]
        if on_lead and (best is None or math.prod(on_lead) < best[0]):
            best = (math.prod(on_lead), index["name"])
    plan = "Seq Scan" if best is None else f"Index Scan using {best[1]}"
    return {
        "selectivities": [round(s, 6) for s in sels],
        "selectivity": round(total, 6),
        "rows": max(1, math.floor(total * case["rows"] + 0.5)),
        "plan": plan,
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints estimate() as JSON.
if __name__ == "__main__":
    print(json.dumps(estimate(json.load(sys.stdin))))
