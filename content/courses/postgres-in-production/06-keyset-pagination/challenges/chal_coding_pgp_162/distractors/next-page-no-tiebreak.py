# @piece next-page: Query for the page after a cursor
Q_NEXT = """
SELECT id, created_at FROM orders
WHERE restaurant_id = :restaurant_id
  AND created_at < :created_at
ORDER BY created_at DESC, id DESC
LIMIT :page_size
"""
