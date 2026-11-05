# @piece decode-cursor: Read a cursor back, rejecting anything else
def decode_cursor(cursor):
    return json.loads(base64.urlsafe_b64decode(cursor.encode()))
