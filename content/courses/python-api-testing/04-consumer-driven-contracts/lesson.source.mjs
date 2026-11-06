// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-2-1",
    title: "Consumer-driven contract tests",
    slug: { _type: "slug", current: "python-consumer-driven-contracts" },
    description:
        "The order API renamed eta_minutes to eta with every provider test green, and the courier app broke in production. Learn consumer-driven contracts: the consumer records what it reads with type matchers, the provider verifies every build against it, and the deploy asks can-i-deploy first.",
    estimatedTime: 16,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The courier app and the order API are released by different teams. A one-word rename in the API's response passed the API's own tests and took down the app's order screen until a hotfix shipped.",
    },

    content: [
        h2("Situation"),
        p("The pull request that broke the courier app:"),
        code("diff", `
 class OrderOut(BaseModel):
     id: int
     status: OrderStatus
-    eta_minutes: int | None
+    eta: int | None          # "shorter name, same thing"
     total: int`, "order_api/schemas.py"),
        bullets([
            "The API's tests were updated in the same pull request and passed.",
            "The courier app 2.14 (in every courier's phone) read `order.eta_minutes`, got `undefined` and crashed the order screen.",
            "Nobody on the API team knew which fields the app read.",
        ]),

        h2("The core you need"),
        bullets([
            "**Provider tests cannot protect consumers.** They change together with the provider's code. Only the consumer knows which fields and status codes it depends on.",
            "**A pact is the consumer's expectations.** The consumer's tests run against a mock provider and record each interaction: provider state, request, and the parts of the response the app reads. The result is published to a broker (Pact Broker or PactFlow).",
            "**Matchers, not values.** `like(12)` means \"a number here\", `regex(...)` a string of a shape, `each_like({...}, min=1)` a non-empty array of things shaped like the example. Literal values only where the app branches on them (`status: \"on_the_way\"`).",
            "**Tolerant reader.** The provider may add fields; the pact only checks the keys the consumer reads. A strict pact breaks on every harmless addition.",
            "**Provider verification.** The provider's CI replays each interaction against the real service, with provider states set up through a hook, and reports the result per consumer version.",
            "**can-i-deploy.** Before a deploy, the pipeline asks the broker whether this version is verified against the consumer versions deployed in the target environment. A failure blocks the release; the fix is usually expand-then-contract (send both `eta_minutes` and `eta` until the old app is gone).",
        ]),

        h2("Apply it in the project"),
        p("On the consumer side (the courier app's test suite, here with pact-python's v3 API), the test states what the app reads:"),
        code("python", `
from pact import Pact, match

pact = Pact("courier-app", "order-api").with_specification("V4")


def test_order_on_the_way():
    (pact.upon_receiving("an order on the way")
        .given("order 91822 is on the way with courier 3107")
        .with_request("GET", "/orders/91822")
        .will_respond_with(200)
        .with_body({
            "id": match.int(91822),
            "status": "on_the_way",
            "eta_minutes": match.int(12),
            "items": match.each_like({"name": match.str("Com tam suon"), "quantity": match.int(2)}, min=1),
            "courier": match.like({"id": 3107, "name": "Tran Van Binh"}),
        }))
    with pact.serve() as mock:
        order = OrderClient(mock.url).get(91822)
        assert order.eta_label() == "12 min"

    pact.write_file("pacts/")`, "courier-app/tests/contract/test_order_api.py"),
        p("On the provider side, CI verifies every published pact and records the result:"),
        code("bash", `
pact-verifier --provider order-api --provider-base-url http://localhost:3000 \\
  --broker-url "$PACT_BROKER_URL" --provider-version "$GIT_SHA" \\
  --state-change-url http://localhost:3000/_pact/provider-states --publish

pact-broker can-i-deploy --pacticipant order-api --version "$GIT_SHA" --to-environment production`, "order-api CI"),
        callout("info", "Library versions",
            "pact-python's API changed between major versions (the `v3` interface above versus the older `Consumer`/`Provider` classes); check the version your project pins before copying examples."),

        h2("Verify"),
        code("text", `
Verifying a pact between courier-app and order-api
  an order on the way
    returns a response which
      has status code 200 (OK)
      has a matching body (FAILED)
Failures:
1) $.eta_minutes -> Expected a value for 'eta_minutes' but it was missing`, "pact-verifier output"),

        h2("Pitfalls"),
        bullets([
            "**Pacts that copy the full response.** Every new field or data change breaks verification and people learn to ignore it. Keep only what the app reads, with matchers.",
            "**Provider states that depend on shared data.** If \"order 91822 is on the way\" relies on a row someone else may change, verification flakes. Create the state in the hook, for that interaction.",
            "**Verifying only the latest consumer.** Phones run old app versions for months. Verify the versions recorded as deployed and gate releases with can-i-deploy.",
        ]),

        challenge("chal_quiz_pat_141"),
        p("Now write the verifier. The editor starts from `verify_pact.py` with its matching rules missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces make the contract stricter or looser than the app needs, on purpose. Run verifies the courier app's pact against several builds of the order API."),
        challenge("chal_coding_pat_142"),
    ],
});
