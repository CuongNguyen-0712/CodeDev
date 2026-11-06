# @piece counts: Lessons, finished lessons and the percent
COUNT(DISTINCT l.lesson_id)  AS total_lessons,
COUNT(DISTINCT lp.lesson_id) AS completed_lessons,
COALESCE(CAST(ROUND(COUNT(DISTINCT lp.lesson_id) * 100.0 / COUNT(DISTINCT l.lesson_id)) AS INTEGER), 0) AS percent
