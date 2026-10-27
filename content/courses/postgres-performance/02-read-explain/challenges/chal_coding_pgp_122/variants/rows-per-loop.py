"""
Find where a PostgreSQL query spends its time, from the output of
EXPLAIN (ANALYZE, FORMAT JSON) - the same JSON tools like explain.depesz.com read.

Every plan node has "Node Type", optionally "Relation Name", "Plan Rows" (the planner's estimate,
per execution), "Actual Total Time" (ms, average per execution), "Actual Rows" (average per
execution), "Actual Loops" (how many times the node ran) and, when it has children, "Plans".
Every entry of "Plans" is a child, whatever its "Parent Relationship" (Outer, Inner, Member,
InitPlan, SubPlan).

analyze_plan(explain) returns:
  {"execution_ms": <"Execution Time">, "hottest": <id>, "nodes": [<one dict per node>]}
  - ids number the nodes 1, 2, 3 ... in depth-first order: a node, then its "Plans" in order.
  - per node: {"id", "node": Node Type, "relation": Relation Name or None, "loops",
               "self_ms", "rows", "rows_ratio"}
  - inclusive time of a node = Actual Total Time x Actual Loops
    self_ms = inclusive time - sum of the inclusive times of its children,
              rounded to 3 decimals, never below 0 (per-loop times are rounded averages)
  - rows = Actual Rows x Actual Loops (rows produced over all executions)
  - rows_ratio = (Actual Rows x Actual Loops) / (Plan Rows x Actual Loops), rounded to 2 decimals;
                 None for a node that never ran (Actual Loops = 0)
  - hottest = id of the node with the largest self_ms (the smallest id on a tie)
A plan without actual times (EXPLAIN without ANALYZE) returns
  {"error": "no actual times: run EXPLAIN (ANALYZE, FORMAT JSON)"}
"""
import json
import sys


def analyze_plan(explain):
    root = explain[0]["Plan"]
    if "Actual Total Time" not in root:
        return {"error": "no actual times: run EXPLAIN (ANALYZE, FORMAT JSON)"}

    nodes = []

    def visit(plan):
        entry = {"id": len(nodes) + 1}
        nodes.append(entry)
        loops = plan["Actual Loops"]
        children = plan.get("Plans", [])
        child_ms = sum(c["Actual Total Time"] * c["Actual Loops"] for c in children)
        entry.update({
            "node": plan["Node Type"],
            "relation": plan.get("Relation Name"),
            "loops": loops,
            "self_ms": max(0, round(plan["Actual Total Time"] * loops - child_ms, 3)),
            "rows": plan["Actual Rows"],
            "rows_ratio": round(plan["Actual Rows"] * loops / (plan["Plan Rows"] * loops), 2),
        })
        for child in children:
            visit(child)

    visit(root)
    hottest = max(nodes, key=lambda n: (n["self_ms"], -n["id"]))
    return {"execution_ms": explain[0]["Execution Time"], "hottest": hottest["id"], "nodes": nodes}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one EXPLAIN (ANALYZE, FORMAT JSON) result from stdin and prints analyze_plan() as JSON.
if __name__ == "__main__":
    print(json.dumps(analyze_plan(json.load(sys.stdin))))
