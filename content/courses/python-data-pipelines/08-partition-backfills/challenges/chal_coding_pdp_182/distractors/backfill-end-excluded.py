# @piece backfill-range: Every day of the range, both ends included
def backfill(db, start, end):
    days, d = [], date.fromisoformat(start)
    while d < date.fromisoformat(end):
        run_day(db, d.isoformat())
        days.append(d.isoformat())
        d += timedelta(days=1)
    return days
