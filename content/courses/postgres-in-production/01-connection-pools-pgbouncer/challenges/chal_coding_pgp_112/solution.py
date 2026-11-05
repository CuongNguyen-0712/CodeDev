"""
Rice Rocket's connection planner, run before anyone raises the HPA's maxReplicas or a pool size.

At the last lunch peak the HPA scaled the api to 12 pods, each with a node-postgres pool of 20,
and the managed PostgreSQL (max_connections 100) answered "FATAL: sorry, too many clients
already". The plan for one scenario (one JSON test case) must say:

  available           server connections the api may use: max_connections minus
                      superuser_reserved_connections minus other_clients (migrations, monitoring)
  client_connections  connections the api opens at the worst moment: every pod of the HPA's
                      maximum with a full pool
  server_connections  connections PostgreSQL sees at peak
                      - no PgBouncer: every client connection is a server connection
                      - session mode: a server connection per connected client
                      - transaction / statement mode: only the transactions running at peak
                        (max_pods * peak_active_per_pod) need one,
                      capped by PgBouncer's default_pool_size; the rest wait in PgBouncer
  too_many_clients    server_connections > available
  pgbouncer_refused   client_connections > max_client_conn (false without PgBouncer)
  waiting_at_peak     clients queued in PgBouncer for a server connection
  broken_features     the api features (in input order) that the pool mode breaks

Feature names: session_set (SET without LOCAL), set_local, listen_notify, session_advisory_lock
(pg_advisory_lock), xact_advisory_lock (pg_advisory_xact_lock), temp_table, with_hold_cursor,
prepared_statements (protocol-level), multi_statement_transaction.
"""
import json
import sys

# @piece mode-rules: What each PgBouncer pool mode breaks
# State that lives in a server session: a later transaction may run on another connection.
SESSION_STATE = {"session_set", "listen_notify", "session_advisory_lock", "temp_table", "with_hold_cursor"}
BROKEN = {
    "session": set(),
    "transaction": SESSION_STATE,
    "statement": SESSION_STATE | {"multi_statement_transaction"},
}
# @end


def broken_features(mode, features, bouncer):
    broken = []
    for feature in features:
        if feature in BROKEN[mode]:
            broken.append(feature)
        elif feature == "prepared_statements" and mode != "session" and not bouncer.get("max_prepared_statements"):
            # PgBouncer tracks protocol-level prepared statements only when max_prepared_statements > 0.
            broken.append(feature)
    return broken


def plan(case):
    server = case["server"]
    app = case["app"]
    bouncer = case.get("pgbouncer")
    # @piece available-connections: Server connections the api may use
    available = server["max_connections"] - server["superuser_reserved_connections"] - server["other_clients"]
    # @end
    # @piece client-connections: Connections the api opens at the worst moment
    clients = app["max_pods"] * app["pool_max"]
    # @end
    peak_active = app["max_pods"] * app["peak_active_per_pod"]

    if bouncer is None:
        server_connections, waiting, refused, broken = clients, 0, False, []
    else:
        mode = bouncer["pool_mode"]
        # @piece server-demand: Server connections the pool mode needs at peak
        needed = clients if mode == "session" else peak_active
        # @end
        # @piece pool-cap: What default_pool_size lets through, and who waits
        server_connections = min(needed, bouncer["default_pool_size"])
        waiting = needed - server_connections
        # @end
        refused = clients > bouncer["max_client_conn"]
        broken = broken_features(mode, case["features"], bouncer)

    return {
        "available": available,
        "client_connections": clients,
        "server_connections": server_connections,
        "too_many_clients": server_connections > available,
        "pgbouncer_refused": refused,
        "waiting_at_peak": waiting,
        "broken_features": broken,
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one scenario (JSON) on stdin and prints its plan as one line of JSON.
if __name__ == "__main__":
    print(json.dumps(plan(json.load(sys.stdin))))
