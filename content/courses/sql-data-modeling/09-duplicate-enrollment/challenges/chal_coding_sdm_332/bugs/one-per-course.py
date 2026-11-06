# @piece one-per-course: The last column and what the table guarantees
status        TEXT    NOT NULL CHECK (status IN ('active', 'cancelled', 'completed'))
