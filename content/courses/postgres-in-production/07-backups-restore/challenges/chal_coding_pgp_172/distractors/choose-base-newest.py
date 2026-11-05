# @piece choose-base: Base backups that can be used, newest first
def usable_base_backups(backups, incident, policy):
    usable = [b for b in backups if b["kind"] == "base"]
    return sorted(usable, key=lambda b: t(b["finished_at"]), reverse=True)
