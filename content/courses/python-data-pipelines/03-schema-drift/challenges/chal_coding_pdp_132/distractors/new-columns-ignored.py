# @piece new-columns: Add the columns the table does not know yet
known = {r[1] for r in wh.execute("PRAGMA table_info(stg_menu_items)")}
added = []
