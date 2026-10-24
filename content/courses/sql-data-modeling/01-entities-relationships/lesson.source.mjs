// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-1-1",
    title: "How to model a domain: entities, relationships & cardinality",
    slug: { _type: "slug", current: "how-to-model-a-domain-entities-relationships-cardinality" },
    description:
        "Learner 7 opens My courses and sees a course they never joined, an empty course reports one learner, and a learner added by an admin quietly disappears. All three come from one column: courses.student_ids, a comma-separated list of user ids. Learn to find entities and attributes in user stories, tell one-to-one, one-to-many and many-to-many apart, model a many-to-many with a join table, read cardinality and optionality on a crow's foot diagram, and migrate the list into an enrollments table you can verify.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev learning platform",
        problem:
            "The first version of CodeDev stored who takes a course in one text column, courses.student_ids, for example '3,17,27,70'. Three tickets arrived in the same week: learner 7 sees \"SQL & Data Modeling\" on their My courses page although they only joined \"Web Application Fundamentals\"; the admin dashboard says the brand-new \"Python Basics\" course has 1 learner when nobody has joined it; and two admins who added learners to the same course at the same moment lost one of the two additions. Product also wants to know who enrolled this week, and the schema has nowhere to keep that date.",
    },

    content: [
        h2("1. The incident: one column, three bugs"),
        p("In the first version of CodeDev, nobody drew a model. The `courses` table needed to know its learners, so it got a column for them:"),
        code("sql", `
CREATE TABLE courses (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  student_ids TEXT NOT NULL DEFAULT ''   -- '3,17,27,70'
);

INSERT INTO courses (id, title, student_ids) VALUES
  (12, 'SQL & Data Modeling',          '3,17,27,70'),
  (13, 'Web Application Fundamentals', '7,8'),
  (14, 'Python Basics',                '');`, "schema v1 (SQLite)"),
        p("It worked for the demo. Then three tickets arrived:"),
        bullets([
            "**\"I see a course I never joined.\"** Learner 7 only enrolled in course 13, but the My courses page also lists course 12.",
            "**\"An empty course has a learner.\"** The admin dashboard says course 14, created this morning, has 1 learner.",
            "**\"My learner vanished.\"** Two admins added a learner to course 13 at the same time. Only one of the two additions was saved.",
        ]),
        p("And a fourth request that is not a bug, but cannot be answered: product wants a chart of enrollments per week. The schema does not store when anyone enrolled."),

        h2("2. Reproduce it in SQLite"),
        p("Paste the schema above into `sqlite3` (or any SQLite playground) and run the two queries the application uses:"),
        code("sql", `
-- My courses for learner 7
SELECT id, title FROM courses WHERE student_ids LIKE '%7%';

-- learners per course, as the dashboard computes it
SELECT id,
       LENGTH(student_ids) - LENGTH(REPLACE(student_ids, ',', '')) + 1 AS learners
FROM courses;`, "reproduce.sql"),
        code("text", `
id | title
---+-----------------------------
12 | SQL & Data Modeling            <- wrong: '3,17,27,70' contains the character 7
13 | Web Application Fundamentals

id | learners
---+---------
12 | 4
13 | 2
14 | 1                              <- wrong: an empty string has no comma, so 0 + 1 = 1`, "output"),
        p("`LIKE '%7%'` matches the character 7 anywhere in the text: in 17, 27 and 70. Counting commas assumes at least one id. You could patch both queries with cleverer string tricks, and the next query would need new tricks. The lost learner is worse: to add someone, the app reads `'7,8'`, appends an id and writes the whole string back. Two admins who read the same `'7,8'` each write their own version, and the last write wins."),
        p("All three bugs have one root cause. The column stores **many facts in one value**: the list of who takes the course. The database cannot index one element of it, check that an id belongs to a real user, or change one element without rewriting the others. The fix is not a better string format. It is a better **model**."),

        h2("3. Entities and attributes"),
        p("Modeling starts from what the product must do, written as user stories, not from tables. Take the stories behind this feature:"),
        bullets([
            "A **learner** can **enroll** in a **course** and see their courses on one page.",
            "A course has **lessons**; a learner can mark a lesson as completed.",
            "An admin can see how many learners each course has and when they enrolled.",
        ]),
        p("Two questions turn the stories into a first model:"),
        bullets([
            "**Which things does the system need to remember, each with its own identity?** Those are **entities**: user (the learner), course, lesson. Each will become a table, and each row is one instance with its own key (lesson 2).",
            "**Which facts describe one instance?** Those are **attributes**: a course's title, a user's email, a lesson's position in its course. Each becomes a column that holds **one value** per row.",
        ]),
        p("A useful test for an attribute: can you say \"the X of this row\" and get exactly one value? \"The title of course 12\" works. \"The student of course 12\" does not - there are four. When the honest answer is \"a list of\", you are not looking at an attribute. You are looking at a **relationship** to another entity."),
        callout("info", "Verbs often hide relationships",
            "In \"a learner enrolls in a course\", the nouns are entities and the verb is a relationship. When the verb carries its own facts - when did they enroll, is the enrollment still active - the relationship needs a table of its own. That is exactly what happened here."),

        h2("4. Relationships and cardinality"),
        p("**Cardinality** says how many instances on one side can be linked to one instance on the other side. There are three shapes, and each one has a standard way to store it:"),
        bullets([
            "**One-to-many (1:N).** One course has many lessons; each lesson belongs to one course. Store it with a foreign key on the **many** side: `lessons.course_id`. Never as a list on the one side.",
            "**Many-to-many (M:N).** One learner enrolls in many courses, and one course has many learners. No single column can hold this. Store it in a **join table** (also called an associative or junction table) with one row per pair: `enrollments(user_id, course_id)`.",
            "**One-to-one (1:1).** One user has at most one notification settings row. Store it as a foreign key with a uniqueness rule, or simply as more columns of `users`. Split a 1:1 into two tables only for a reason, such as rarely used or sensitive data.",
        ]),
        p("The join table is the fix for this incident, and it brings a bonus: facts that belong to the **pair** finally have a home. The enrollment date is not a fact about the learner (they enroll many times) or about the course (it has many learners). It describes one learner in one course, so it is a column of `enrollments`, next to the enrollment's `status`. Progress works the same way: `lesson_progress(user_id, lesson_id, completed_at)` is the join table between users and lessons."),
        code("sql", `
CREATE TABLE users (
  id    INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);

CREATE TABLE courses (
  id    INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE lessons (
  id        INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),   -- 1:N, key on the many side
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL
);

CREATE TABLE enrollments (                              -- M:N users <-> courses
  user_id     INTEGER NOT NULL REFERENCES users(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id),
  enrolled_at TEXT    NOT NULL,                         -- fact about the pair
  status      TEXT    NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE lesson_progress (                          -- M:N users <-> lessons
  user_id      INTEGER NOT NULL REFERENCES users(id),
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id),
  completed_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);`, "schema v2 (SQLite)"),
        p("Keys and the `REFERENCES` clause are the subject of lesson 2. For now, read `PRIMARY KEY (user_id, course_id)` as \"one row per learner and course\"."),
        challenge("chal_quiz_sdm_111"),

        h2("5. Optionality: zero, or at least one?"),
        p("Cardinality gives the **maximum** (one or many). **Optionality** gives the **minimum** (zero or one). Both matter, because they become different rules:"),
        bullets([
            "**Every lesson belongs to exactly one course.** Minimum one, maximum one. In the schema: `lessons.course_id` is `NOT NULL` and references `courses`.",
            "**A course may have zero learners.** Course 14 is new. Nothing stops a course row from existing without any enrollment row, which is what we want.",
            "**A learner may have zero enrollments.** People sign up before they choose a course.",
            "**A course must have at least one lesson** before it is published. This minimum lives on the many side, and a plain column constraint cannot express it. It becomes an application rule checked when publishing, inside a transaction (lesson 8).",
        ]),
        p("Getting optionality wrong shows up later as bad data or as rejected good data. Make a mandatory link optional and you get lessons with no course. Make an optional link mandatory and the sign-up form suddenly needs a course before an account can exist."),

        h2("6. Reading a crow's foot diagram"),
        p("An **entity-relationship diagram (ERD)** draws the model before anyone writes `CREATE TABLE`. The most common notation in tools is **crow's foot**: each end of a line carries two marks. The mark next to the box is the maximum, the one further away is the minimum."),
        image("crows-foot-erd", {
            alt: "Before and after. On the left, in red, the old courses table with a student_ids text column holding '3,17,27,70' and the three bugs it caused: LIKE '%7%' also matches 17, 27 and 70, an empty list counts as 1 learner, and two concurrent edits lose one learner. On the right, in green, a crow's foot diagram: users one-and-only-one to zero-or-many enrollments, courses one-and-only-one to zero-or-many enrollments, courses one-and-only-one to one-or-many lessons, and users and lessons each one-and-only-one to zero-or-many lesson_progress. A legend explains the four end marks.",
            caption: "Read each end from the far side: \"one course has zero or many enrollments\", \"each enrollment belongs to exactly one course\".",
        }),
        bullets([
            "Two bars - **exactly one**: minimum one, maximum one. Written `||` in the text form below.",
            "Circle and bar - **zero or one**. Written `o|` or `|o`.",
            "Bar and crow's foot - **one or many**. Written `|{` or `}|`.",
            "Circle and crow's foot - **zero or many**. Written `o{` or `}o`.",
        ]),
        p("Read a line one direction at a time. Between `courses` and `enrollments`: next to `enrollments` there is a circle and a crow's foot, so **one course has zero or many enrollments**. Next to `courses` there are two bars, so **each enrollment belongs to exactly one course**. Many tools also accept a text form you can keep in the repository next to the migrations:"),
        code("text", `
erDiagram
  users   ||--o{ enrollments     : "enrolls"
  courses ||--o{ enrollments     : "has"
  courses ||--|{ lessons         : "contains"
  users   ||--o{ lesson_progress : "records"
  lessons ||--o{ lesson_progress : "tracked by"`, "model.mmd (Mermaid ER syntax)"),
        callout("tip", "A many-to-many always becomes two one-to-many lines",
            "On a finished ERD you will not see a line with a crow's foot at both ends. The join table sits in the middle, and each side has a plain one-to-many line to it. If you still see many-to-many, the join table is missing - just like it was missing in schema v1."),

        h2("7. The fix: migrate the list into enrollments"),
        p("Create the v2 tables, then move every id out of the string into its own row. SQLite's `json_each` can split a list once it looks like a JSON array, so first check that every value really does:"),
        code("sql", `
-- 1. find lists that will not split cleanly (trailing commas, spaces in odd places, letters)
SELECT id, student_ids
FROM courses
WHERE json_valid('[' || student_ids || ']') = 0;

-- 2. one row per learner and course
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
SELECT DISTINCT j.value, c.id, '2026-10-01 00:00:00', 'active'
FROM courses AS c, json_each('[' || c.student_ids || ']') AS j;`, "migrate_student_ids.sql"),
        p("The old design never recorded when anyone enrolled, so that history is gone. The migration stamps imported rows with the migration date; write that down in the migration notes so nobody reads it as a real enrollment date. `DISTINCT` drops a learner listed twice in the same string, which the primary key would otherwise reject."),
        p("Then prove the move lost nothing, before any code reads from the new table:"),
        code("sql", `
-- learners per course from the new table: course 14 now shows 0
SELECT c.id, COUNT(e.user_id) AS learners
FROM courses AS c
LEFT JOIN enrollments AS e ON e.course_id = c.id
GROUP BY c.id;

-- My courses for learner 7: an exact match on a key, no text search
SELECT c.id, c.title
FROM enrollments AS e
JOIN courses AS c ON c.id = e.course_id
WHERE e.user_id = 7;

-- ids that do not exist in users (should be zero rows)
SELECT e.user_id FROM enrollments AS e
LEFT JOIN users AS u ON u.id = e.user_id
WHERE u.id IS NULL;`, "verify.sql"),
        p("Compare the first query with the old comma count: they must agree for every course except the empty ones, which now correctly show 0. The second query returns only course 13. The third finds ids in the old strings that never belonged to a real user - the string column could not catch those, and lesson 2 shows how a foreign key prevents them from now on."),
        p("Adding a learner is now an `INSERT` of one row. Two admins adding two different learners write two different rows, and neither overwrites the other. (Two requests adding the **same** learner at once is a different race, and lesson 9 is about it.)"),

        h2("8. When a simpler model is fine"),
        p("Modeling is not \"make a table for every noun\". Some honest shortcuts:"),
        bullets([
            "**Data you never query inside.** A learner's UI preferences (theme, editor font size), read and written as one blob by one screen, can live in a JSON or text column. The moment you need `WHERE` on one of its fields, a join, or a reference to another table, it has become part of the model.",
            "**A fixed, tiny set of values.** An enrollment `status` of `'active'`, `'completed'` or `'cancelled'` does not need its own table; a `CHECK` constraint (lesson 7) is enough. Promote it to a table when the values gain attributes of their own, such as a label or a sort order shown in the UI.",
            "**One-to-one splits.** Keep 1:1 data in one table unless you have a reason to split it: very large columns that most queries skip, or sensitive data that needs different access rules.",
        ]),
        p("The rule of thumb: if the database must **find, count, join or check** the pieces, model the pieces. If it only stores and returns the whole, a single value is fine."),

        h2("9. Pitfalls"),
        bullets([
            "**Lists in a column** (`'3,17,27'`, a JSON array of ids, `tag1;tag2`). Spot them by searching the schema for plural column names and for queries using `LIKE '%...%'` on ids.",
            "**The relationship's facts on the wrong entity.** `users.enrolled_at` can hold one date, but a learner enrolls in many courses. Ask \"enrolled at - in which course?\" If you need the other entity to answer, the column belongs on the join table.",
            "**Numbered columns** (`course_1`, `course_2`, `course_3`). It is the same list, spread sideways, and it breaks at the fourth course.",
            "**Ignoring optionality.** Write the minimum on the diagram for every line. A missing minimum becomes either a `NOT NULL` that blocks valid data or a nullable column that lets orphans in.",
            "**Modeling the screen, not the domain.** The My courses page shows title, progress and enrollment date together. That is a query joining three tables, not a reason for one table with all three.",
        ]),

        h2("10. Checklist"),
        bullets([
            "I listed the entities from the user stories, and every attribute holds one value per row.",
            "For every relationship I wrote the cardinality (1:1, 1:N, M:N) and the optionality at both ends.",
            "Every 1:N is a foreign key on the many side; every M:N has a join table.",
            "Facts about a pair (enrolled_at, status, completed_at) live on the join table.",
            "After a migration, I compared old and new counts per parent row and checked for ids that match nothing.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Add discussions to the model: a learner can post comments on a lesson, and other learners can reply to a comment. Write the user stories, list the entities and attributes, draw the crow's foot diagram with the minimum and maximum at each end, and decide where \"posted at\" and \"edited at\" belong. Then write the CREATE TABLE statements and one query that lists the comments of a lesson with their authors."),

        h2("Sources"),
        bullets([
            "Peter Pin-Shan Chen, \"The Entity-Relationship Model - Toward a Unified View of Data\", ACM Transactions on Database Systems, 1976 (entities, relationships and their attributes).",
            "SQLite documentation: \"JSON Functions And Operators\" (json_valid and the json_each table-valued function).",
            "PostgreSQL documentation, \"Data Definition\" chapter, \"Constraints\" section (foreign keys and the many-to-many example with a join table).",
        ]),
    ],
});
