# @piece load-and-commit: Load the rows and save the watermark
wh.execute("UPDATE etl_state SET last_updated_at = ? WHERE job = 'orders'", (new_watermark,))
wh.commit()
with wh:
    wh.executemany(
        """INSERT INTO fact_orders (order_id, status, total_vnd, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (order_id) DO UPDATE SET status = excluded.status,
               total_vnd = excluded.total_vnd, updated_at = excluded.updated_at""",
        rows,
    )
