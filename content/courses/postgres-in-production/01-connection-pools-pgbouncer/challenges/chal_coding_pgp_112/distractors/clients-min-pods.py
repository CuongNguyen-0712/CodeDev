# @piece client-connections: Connections the api opens at the worst moment
clients = app["min_pods"] * app["pool_max"]
