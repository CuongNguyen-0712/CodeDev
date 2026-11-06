# @piece report-knee: Report the step before the first broken one
if reasons:
    return {"knee_rps": row["offered_rps"],
            "first_saturated_rps": row["offered_rps"], "reasons": reasons,
            "baseline_p95_ms": baseline, "reached": True, "ignored_rows": ignored}
