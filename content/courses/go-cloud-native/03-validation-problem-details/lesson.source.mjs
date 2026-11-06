// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-1-3",
    title: "Request validation and problem details",
    slug: { _type: "slug", current: "go-gateway-validation-problem-details" },
    description:
        "Rice Rocket's order check refused every iPhone order, ignored a misspelled field and showed one error at a time. Learn how to validate a JSON body at the edge - media types, body size, strict decoding, field rules - and answer refusals as RFC 9457 problem details, then fix the gateway's order check.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The gateway rejects malformed orders before they reach the api, so the api's own validation only sees well-formed requests. Its first version shipped on a Friday; by Saturday lunch the support channel had three different complaints about it.",
    },

    content: [
        h2("Situation"),
        p("The three reports, with the request that triggered each:"),
        code("text", `
# iOS app (every order since the release)
POST /v1/orders   Content-Type: application/json; charset=utf-8
-> 415 Unsupported Media Type

# web shop (a typo in a new release)
POST /v1/orders   {"restaurantId":"r-pho-24","items":[{"menuItemId":"pho-bo","quantitiy":2}], ...}
-> 422 items[0].quantity must be between 1 and 20      (the field name was wrong, not the number)

# Android app (a cart with two problems)
-> 422 restaurantId is required
   (user fixes it, submits again)
-> 422 items[1].quantity must be between 1 and 20`, "support tickets"),

        h2("The core you need"),
        bullets([
            "**Media types have parameters.** `application/json; charset=utf-8` is JSON. Compare the part before `;`, case-insensitively (`mime.ParseMediaType` does it properly in a real handler). Anything that is not JSON gets `415 Unsupported Media Type`.",
            "**Bound the body before reading it.** `r.Body = http.MaxBytesReader(w, r.Body, 16<<10)` stops a client from streaming megabytes into your decoder; the read fails with `*http.MaxBytesError`, which you answer with `413 Content Too Large`.",
            "**Decode strictly.** `json.Decoder.DisallowUnknownFields()` turns a misspelled or unsupported field into an error instead of a silent zero value. Syntax errors and wrong types are `400`.",
            "**Validate all fields, answer once.** Rules about values (required, ranges) are `422 Unprocessable Content`. Collect every violation with its field path (`items[1].quantity`) so a client can show them together.",
            "**Problem details (RFC 9457).** Refusals use `Content-Type: application/problem+json` and a body with `type` (a URI naming the problem kind), `title`, `status`, `detail`, plus extension members such as `errors`. Clients branch on `type`, not on the English text.",
        ]),

        h2("Apply it in the project"),
        code("go", `
func validateOrder(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mt != "application/json" {
			writeProblem(w, problem(415, "unsupported-media-type", "Unsupported Media Type", "send the order as application/json"))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeProblem(w, problem(413, "body-too-large", "Content Too Large", "the body is over 16 KiB"))
			return
		}
		if _, p, _ := checkOrder(mt, body); p != nil {
			writeProblem(w, p)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body)) // the api reads the same bytes
		next.ServeHTTP(w, r)
	})
}

func writeProblem(w http.ResponseWriter, p *Problem) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	json.NewEncoder(w).Encode(p)
}`, "cmd/gateway/validate.go"),
        callout("info", "Edge checks and api checks",
            "The gateway checks shape (media type, size, known fields, simple ranges). Business rules that need data, such as whether the restaurant is open, stay in the api. Both answer with the same problem format, so clients have one error parser."),

        h2("Verify"),
        code("bash", `
curl -s -X POST localhost:8080/v1/orders -H 'Content-Type: application/json; charset=utf-8' \\
  -d '{"restaurantId":"","items":[{"menuItemId":"pho-bo","quantity":0}],"deliveryAddress":"12 Nguyen Hue"}' | jq
# {
#   "type": "https://api.ricerocket.vn/problems/invalid-order",
#   "title": "Invalid order", "status": 422, "detail": "2 field(s) are invalid",
#   "errors": [ {"field": "restaurantId", "detail": "is required"},
#               {"field": "items[0].quantity", "detail": "must be between 1 and 20"} ]
# }
curl -si -X POST localhost:8080/v1/orders -H 'Content-Type: application/json' -d '{"promoCode":"X"}' | head -1
# HTTP/1.1 400 Bad Request`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Exact string match on Content-Type.** Breaks the first client that adds `charset`. A test with `application/json; charset=utf-8` catches it.",
            "**Lenient decoding.** Without `DisallowUnknownFields` a renamed field quietly becomes a zero value and the error points at the wrong thing. Watch for 422s on fields the client says it sent.",
            "**Returning at the first error.** Users fix one field per round trip. Assert in a test that two bad fields produce two entries in `errors`.",
        ]),

        p("Now fix the check. The editor holds `main.go` with the faulty blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last month's buggy blocks. Run sends the bodies from the bug reports, and a few more, through the check and prints the answer."),
        challenge("chal_coding_gcn_132"),
    ],
});
