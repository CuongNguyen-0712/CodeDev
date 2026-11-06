# @piece joins: Where the numbers come from
LEFT JOIN (SELECT course_id, COUNT(*) AS learners
           FROM enrollments
           GROUP BY course_id) lc ON lc.course_id = c.course_id
LEFT JOIN (SELECT l.course_id, COUNT(*) AS completed_lessons
           FROM lesson_progress lp
           JOIN lessons l ON l.lesson_id = lp.lesson_id
           GROUP BY l.course_id) cc ON cc.course_id = c.course_id
