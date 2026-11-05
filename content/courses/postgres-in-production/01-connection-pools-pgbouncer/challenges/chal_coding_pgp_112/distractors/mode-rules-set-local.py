# @piece mode-rules: What each PgBouncer pool mode breaks
# State that lives in a server session: a later transaction may run on another connection.
SESSION_STATE = {"set_local", "listen_notify", "session_advisory_lock", "xact_advisory_lock", "temp_table"}
BROKEN = {
    "session": set(),
    "transaction": SESSION_STATE,
    "statement": SESSION_STATE | {"multi_statement_transaction"},
}
