# @piece volume: Warning: far fewer rows than a normal recent day
{"name": "volume", "severity": "warn", "sql": """
    SELECT CASE WHEN (SELECT COUNT(*) FROM staging_orders)
                     < 0.7 * (SELECT COUNT(*) FROM orders WHERE date(placed_at, '+7 hours') = date(:batch_day, '-1 day'))
                THEN 1 ELSE 0 END"""},
