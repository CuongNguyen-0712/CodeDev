# @piece enroll: Insert the enrollment
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (:user_id, :course_id, :at, 'active')
ON CONFLICT (user_id, course_id) DO UPDATE
    SET status = 'active', enrolled_at = excluded.enrolled_at
