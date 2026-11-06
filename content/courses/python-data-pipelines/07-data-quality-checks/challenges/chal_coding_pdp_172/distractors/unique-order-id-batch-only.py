# @piece unique-order-id: Error: order ids repeated or already published
{"name": "unique-order-id", "severity": "error", "sql": """
    SELECT COUNT(*) FROM (SELECT order_id FROM staging_orders GROUP BY order_id HAVING COUNT(*) > 1)"""},
