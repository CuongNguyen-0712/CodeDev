# @piece active-index: Index for a restaurant's active orders, newest first
ACTIVE_INDEX = """
CREATE INDEX orders_active_by_restaurant
    ON orders (restaurant_id, created_at)
    WHERE status <> 'delivered';
"""
