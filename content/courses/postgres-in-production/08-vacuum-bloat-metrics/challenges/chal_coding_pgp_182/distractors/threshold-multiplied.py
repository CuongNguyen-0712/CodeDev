# @piece vacuum-threshold: Dead rows that make autovacuum start
def vacuum_threshold(table, params):
    return params["autovacuum_vacuum_threshold"] * params["autovacuum_vacuum_scale_factor"] * table["reltuples"]
