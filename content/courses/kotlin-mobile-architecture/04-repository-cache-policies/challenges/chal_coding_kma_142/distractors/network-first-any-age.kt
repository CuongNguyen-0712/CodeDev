// @piece network-first: NETWORK_FIRST: the network, then a recent cache entry
Policy.NETWORK_FIRST -> {
    val value = fetchAndStore(key, now)
    if (value != null) out += "network:$value"
    else {
        if (cached != null) out += label(cached, now)
        out += "error:offline"
    }
}
