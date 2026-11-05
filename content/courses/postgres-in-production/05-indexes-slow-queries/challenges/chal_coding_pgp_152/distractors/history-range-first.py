# @piece history-index: Index for one customer's orders in a date range
HISTORY_INDEX = """
CREATE INDEX orders_by_created_customer ON orders (created_at, customer_id);
"""
