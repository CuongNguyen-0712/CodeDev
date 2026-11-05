# @piece active-index: Index for a restaurant's active orders, newest first
ACTIVE_INDEX = """
CREATE INDEX orders_by_restaurant ON orders (restaurant_id);
CREATE INDEX orders_by_created ON orders (created_at);
"""
