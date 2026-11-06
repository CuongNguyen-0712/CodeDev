# @piece user-columns: Rules for a user's email and name
email    TEXT NOT NULL
         CONSTRAINT users_email_unique UNIQUE
         CONSTRAINT users_email_has_at CHECK (instr(email, '@') > 0),
name     TEXT NOT NULL
