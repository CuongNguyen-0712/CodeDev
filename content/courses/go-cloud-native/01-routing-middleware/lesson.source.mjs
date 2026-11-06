// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-1-1",
    title: "Routing and middleware chains with net/http",
    slug: { _type: "slug", current: "go-gateway-routing-middleware" },
    description:
        "Rice Rocket's new Go gateway answered 404 where clients expected 405, let health probes fail on auth, and lost every crashing request from its access log. Learn Go 1.22+ ServeMux patterns, path values and how a middleware chain wraps a handler, then wire the gateway's routes and middleware in the right order.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Mobile apps, the web shop and partner restaurants all call the api through one entry point. The team is replacing an Nginx config full of location blocks with a small Go gateway that authenticates, tags and logs every request before passing it on. Its first week in staging produced three bug reports.",
    },

    content: [
        h2("Situation"),
        p("The first version of the gateway, reduced to its routing and middleware:"),
        code("go", `
mux := http.NewServeMux()
mux.HandleFunc("/healthz", healthz)
mux.HandleFunc("/v1/orders/", getOrder) // id parsed with strings.TrimPrefix
handler := withRecovery(withAuth(withLogging(log, mux)))
http.ListenAndServe(":8080", withRequestID(handler))`, "cmd/gateway/main.go"),
        bullets([
            "`DELETE /v1/orders/42` from a partner reached `getOrder` and returned the order, instead of telling the client the method is not allowed.",
            "Kubernetes marked every pod unready: the readiness probe on `/healthz` got `401` from `withAuth`.",
            "A nil-map bug in one handler returned 500 to clients, but `grep /v1/orders access.log` showed none of those requests.",
        ]),

        h2("The core you need"),
        bullets([
            "**Patterns carry the method and wildcards (Go 1.22+).** `mux.Handle(\"GET /v1/orders/{id}\", h)` matches only GET (and HEAD) on that shape; `r.PathValue(\"id\")` returns the segment. A matching path with the wrong method gets `405 Method Not Allowed` and an `Allow` header; an unknown path gets 404.",
            "**More specific patterns win.** `GET /v1/orders/{id}` beats `/v1/orders/`; two patterns that match the same requests with neither more specific make `Handle` panic at startup, which is better than a silent overlap.",
            "**Middleware is a function from handler to handler.** `func withX(next http.Handler) http.Handler` runs code before and after `next.ServeHTTP(w, r)`. In `a(b(c(mux)))` the request passes a, b, c in that order and the response comes back c, b, a.",
            "**Apply middleware where it belongs.** Wrap the whole mux with what every request needs (request id, logging, recovery); wrap individual routes with what only some need (auth), so probes and public routes stay open.",
            "**Seeing the status needs a wrapper.** `http.ResponseWriter` does not expose the status a handler wrote; a small type that embeds it and overrides `WriteHeader` records it (start at 200: a handler that only calls `Write` sends 200).",
            "**Panics.** net/http recovers a handler panic per request and closes the connection, so the client gets no status at all. A recovery middleware inside the logging middleware answers 500 and lets the log record it.",
        ]),

        h2("Apply it in the project"),
        code("go", `
func newGateway(log *slog.Logger, api http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	})
	mux.Handle("GET /v1/orders/{id}", requireToken(api))
	mux.Handle("POST /v1/orders", requireToken(api))
	return withRequestID(withLogging(log, withRecovery(mux)))
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func withLogging(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		log.Info("request", "id", r.Header.Get("X-Request-ID"), "method", r.Method,
			"path", r.URL.Path, "status", rec.status, "duration", time.Since(start))
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}`, "cmd/gateway/gateway.go"),
        callout("info", "Logging the route, not the path",
            "`r.Pattern` (Go 1.23+) holds the pattern that matched, such as `GET /v1/orders/{id}`. Log it next to the path: dashboards group by route without one series per order id."),

        h2("Verify"),
        code("bash", `
go test ./cmd/gateway/...
curl -si -X DELETE -H 'Authorization: Bearer t' localhost:8080/v1/orders/42 | head -3
# HTTP/1.1 405 Method Not Allowed
# Allow: GET, HEAD
curl -s -o /dev/null -w '%{http_code}\\n' localhost:8080/healthz    # 200, no token needed
curl -s -o /dev/null -w '%{http_code}\\n' -H 'Authorization: Bearer t' localhost:8080/v1/boom
# 500, and the access log has: ... path=/v1/boom status=500`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Old prefix patterns left behind.** `/v1/orders/` still matches every method and every deeper path. Detect it with a table test that sends a wrong method and expects 405; replace it with method patterns.",
            "**A status recorder that starts at 0.** Handlers that only call `Write` never call your `WriteHeader`, so the log shows status 0 for most successes. Initialise it to 200.",
            "**Recovery outside logging.** The panic unwinds through the logging wrapper before anything recovers it, so crashing requests vanish from the log. Keep recovery innermost of the whole-mux wrappers.",
        ]),

        challenge("chal_quiz_gcn_111"),
        p("Now wire the gateway. The editor holds `main.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first week's mistakes on purpose. To keep Run fast, the file ends with a small copy of the net/http API with the same names (no `http.` prefix); Run sends test requests through your handler and prints the responses and the access log."),
        challenge("chal_coding_gcn_112"),
    ],
});
