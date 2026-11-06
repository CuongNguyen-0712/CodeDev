// @piece log-status: Serve through a recorder; 200 if WriteHeader is never called
rec := &statusRecorder{ResponseWriter: w}
next.ServeHTTP(rec, r)
