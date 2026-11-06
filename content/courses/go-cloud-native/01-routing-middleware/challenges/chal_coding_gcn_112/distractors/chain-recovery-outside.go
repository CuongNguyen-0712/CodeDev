// @piece chain-order: Wrap the mux: request id, then logging, then recovery
return withRecovery(withRequestID(withLogging(log, mux)))
