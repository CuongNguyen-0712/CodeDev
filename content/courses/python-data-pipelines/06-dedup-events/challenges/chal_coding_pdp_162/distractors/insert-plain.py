# @piece insert-new: Add only events the warehouse has not seen
Q_INSERT_NEW = """
INSERT INTO events (event_id, order_id, event_type, amount_vnd, event_time, ingested_at)
""" + Q_BATCH_UNIQUE
