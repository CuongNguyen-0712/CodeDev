# @piece set-target: Where replay stops
def recovery_target(incident, chain_end):
    return min(incident, chain_end)
