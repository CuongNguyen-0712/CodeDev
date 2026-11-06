# @piece resolve-columns: Match each file column to a table column
order = list(CONTRACT)
for i, raw in enumerate(header):
    mapping[i] = order[i] if i < len(order) else raw.strip().lower()
