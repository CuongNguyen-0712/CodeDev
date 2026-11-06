# @piece upsert: Insert a payout, or update the existing one
UPSERT = """
INSERT OR REPLACE INTO restaurant_payouts (restaurant_id, business_date, amount_vnd, orders, computed_at)
VALUES (:restaurant_id, :business_date, :amount_vnd, :orders, :computed_at)
"""
