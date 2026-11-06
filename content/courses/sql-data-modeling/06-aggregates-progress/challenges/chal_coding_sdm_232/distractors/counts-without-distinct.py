# @piece counts: Lessons, finished lessons and the percent
COUNT(l.lesson_id)  AS total_lessons,
COUNT(lp.lesson_id) AS completed_lessons,
COALESCE(COUNT(lp.lesson_id) * 100 / COUNT(l.lesson_id), 0) AS percent
