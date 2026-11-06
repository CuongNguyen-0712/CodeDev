# @piece day-bounds: UTC start and end of one business day
def day_bounds(day):
    start = datetime.fromisoformat(day)
    end = start + timedelta(days=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")
