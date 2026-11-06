# @piece upsert: Insert a payout, or update the existing one
UPSERT = """
INSERT INTO restaurant_payouts (restaurant_id, business_date, amount_vnd, orders, computed_at)
VALUES (:restaurant_id, :business_date, :amount_vnd, :orders, :computed_at)
ON CONFLICT (restaurant_id, business_date) DO UPDATE SET
    amount_vnd  = excluded.amount_vnd,
    orders      = excluded.orders,
    computed_at = excluded.computed_at
"""
