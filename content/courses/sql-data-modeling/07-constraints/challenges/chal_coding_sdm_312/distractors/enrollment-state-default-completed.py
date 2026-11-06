# @piece enrollment-state: Date, status and the key of an enrollment
enrolled_at  TEXT NOT NULL,
status       TEXT NOT NULL DEFAULT 'completed'
             CONSTRAINT enrollments_status_check
             CHECK (status IN ('active', 'completed', 'cancelled')),
CONSTRAINT enrollments_pkey PRIMARY KEY (user_id, course_id)
