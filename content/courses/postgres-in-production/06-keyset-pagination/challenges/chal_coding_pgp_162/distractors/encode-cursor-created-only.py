# @piece encode-cursor: Turn the last row of a page into a cursor
def encode_cursor(row):
    data = json.dumps({"created_at": row[1]}, separators=(",", ":"))
    return base64.urlsafe_b64encode(data.encode()).decode()
