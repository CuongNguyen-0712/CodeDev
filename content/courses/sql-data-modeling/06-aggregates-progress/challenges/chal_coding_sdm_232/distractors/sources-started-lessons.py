# @piece sources: The rows each course card is counted from
FROM enrollments AS e
JOIN courses AS c
  ON c.course_id = e.course_id
LEFT JOIN lessons AS l
  ON l.course_id = c.course_id
LEFT JOIN lesson_progress AS lp
  ON lp.lesson_id = l.lesson_id
 AND lp.user_id = e.user_id
