# @piece joins: Where the numbers come from
JOIN enrollments e      ON e.course_id = c.course_id
JOIN lessons l          ON l.course_id = c.course_id
JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = e.user_id
WHERE e.status <> 'cancelled'
  AND lp.completed_at IS NOT NULL
GROUP BY c.course_id, c.title
