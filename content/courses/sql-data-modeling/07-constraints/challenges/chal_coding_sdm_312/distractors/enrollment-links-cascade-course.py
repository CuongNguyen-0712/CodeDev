# @piece enrollment-links: Who and what an enrollment points to
user_id      INTEGER NOT NULL
             REFERENCES users (user_id) ON DELETE CASCADE,
course_id    INTEGER NOT NULL
             REFERENCES courses (course_id) ON DELETE CASCADE,
