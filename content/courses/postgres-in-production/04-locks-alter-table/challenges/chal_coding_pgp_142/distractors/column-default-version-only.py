# @piece column-default: ADD COLUMN: when its default rewrites the table
def default_rewrites(default, pg_version):
    return default is not None and pg_version < 11
