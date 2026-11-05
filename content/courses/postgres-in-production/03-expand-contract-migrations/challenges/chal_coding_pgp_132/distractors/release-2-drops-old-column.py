# @piece release-2-migration: Release 2: what runs before v2 rolls out
RELEASE_2 = [
    "DROP TRIGGER orders_phone_sync",
    "ALTER TABLE orders DROP COLUMN customer_phone",
]
