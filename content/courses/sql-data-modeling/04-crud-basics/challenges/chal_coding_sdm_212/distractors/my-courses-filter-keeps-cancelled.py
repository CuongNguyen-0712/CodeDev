# @piece my-courses-filter: Only this learner's live enrollments, in title order
WHERE e.user_id = :user_id
ORDER BY c.title, c.course_id
