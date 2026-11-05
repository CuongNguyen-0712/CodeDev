# @piece backfill-batch: Fill the new column for existing rows, one batch
BACKFILL = """
UPDATE orders
SET phone_e164 = '+84' || substr(customer_phone, 2)
WHERE phone_e164 IS NULL AND customer_phone IS NOT NULL
"""
