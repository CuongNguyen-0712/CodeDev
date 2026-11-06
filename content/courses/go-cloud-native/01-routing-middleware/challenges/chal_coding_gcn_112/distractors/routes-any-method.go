// @piece routes: Routes: method + path patterns; probes need no token
mux.HandleFunc("/healthz", func(w ResponseWriter, r *Request) {
	fmt.Fprint(w, "ok")
})
mux.Handle("/v1/orders/{id}", requireToken(HandlerFunc(getOrder)))
mux.Handle("/v1/orders", requireToken(HandlerFunc(createOrder)))
mux.Handle("/v1/boom", requireToken(HandlerFunc(boom)))
