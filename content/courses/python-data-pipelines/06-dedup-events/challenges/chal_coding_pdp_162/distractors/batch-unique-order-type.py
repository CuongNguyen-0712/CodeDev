# @piece batch-unique: One row per event from tonight's file
Q_BATCH_UNIQUE = """
SELECT event_id, order_id, event_type, amount_vnd, event_time, ingested_at
FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY order_id, event_type ORDER BY ingested_at, rowid) AS copy
    FROM staging s
)
WHERE copy = 1
"""
