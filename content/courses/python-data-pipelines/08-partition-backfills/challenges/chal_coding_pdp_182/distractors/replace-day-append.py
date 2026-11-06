# @piece replace-day: Recompute one day so a rerun gives the same rows
def run_day(db, day):
    start, end = day_bounds(day)
    with db:
        db.execute(
            """INSERT INTO fact_commission (day, restaurant_id, orders, commission_vnd)
               SELECT ?, restaurant_id, COUNT(*), CAST(ROUND(SUM(subtotal_vnd) * 0.18) AS INTEGER)
               FROM orders WHERE placed_at >= ? AND placed_at < ?
               GROUP BY restaurant_id""",
            (day, start, end),
        )
