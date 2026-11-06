# @piece extract: The changed orders, oldest change first
rows = src.execute(
    "SELECT order_id, status, total_vnd, updated_at FROM orders WHERE updated_at > ? ORDER BY updated_at, order_id",
    (watermark,),
).fetchall()
