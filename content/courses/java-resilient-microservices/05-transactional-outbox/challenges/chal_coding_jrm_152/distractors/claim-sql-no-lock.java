// @piece claim-sql: The query a relay pod uses to claim unsent events
static final String CLAIM_SQL =
        "SELECT id, aggregate_id, type FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT ?";
