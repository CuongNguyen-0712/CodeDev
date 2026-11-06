# @piece natural-key: The table, keyed by what makes a payout unique
SCHEMA = """
CREATE TABLE restaurant_payouts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date TEXT    NOT NULL,
    amount_vnd    INTEGER NOT NULL,
    orders        INTEGER NOT NULL,
    computed_at   TEXT    NOT NULL,
    paid_at       TEXT
)
"""
