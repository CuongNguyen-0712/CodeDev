# @piece daily-revenue: Paid revenue per business day in Ho Chi Minh City
Q_DAILY_REVENUE = """
SELECT date(ingested_at, '+7 hours') AS day, SUM(amount_vnd) AS revenue_vnd
FROM events
WHERE event_type = 'order_paid'
GROUP BY day
ORDER BY day
"""
