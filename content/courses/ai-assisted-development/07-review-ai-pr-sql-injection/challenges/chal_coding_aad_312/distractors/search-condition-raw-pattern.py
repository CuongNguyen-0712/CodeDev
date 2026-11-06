# @piece search-condition: Build the title search
sql = (
    "SELECT course_id, title, level FROM courses "
    "WHERE title LIKE ? AND status = 'published'"
)
params = ["%" + q + "%"]
