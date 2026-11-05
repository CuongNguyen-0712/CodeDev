// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kfk-3-2",
    title: "Schemas and compatible event changes",
    slug: { _type: "slug", current: "kafka-schema-evolution-compatibility" },
    description:
        "Rice Rocket renamed one field and made another required in its OrderPlaced event: the weekly-deployed analytics consumer crashed, and a consumer that upgraded early could not read last week's events. Learn who reads whose data in BACKWARD, FORWARD and FULL compatibility, why the transitive modes matter while old events are retained, which changes are safe, and fix the CI check that let the change through.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api publishes OrderPlaced events to `orders.v1`; analytics, courier-matcher and notifications consume them on their own release schedules. Schemas live in a schema registry, and CI runs a compatibility check before a new version is registered. The check passed a change that broke two consumers.",
    },

    content: [
        h2("Situation"),
        p("The api team tidied up the OrderPlaced schema: `deliveryAddress` became `address`, and `tip`, which some clients left out, became required (it already had a default of 0):"),
        code("json", `
{
  "type": "object",
  "properties": {
    "orderId":      { "type": "string" },
    "restaurantId": { "type": "string" },
    "address":      { "type": "string" },
    "total":        { "type": "integer" },
    "tip":          { "type": "integer", "default": 0 }
  },
  "required": ["orderId", "restaurantId", "address", "total", "tip"]
}`, "schemas/order-placed.v2.json"),
        bullets([
            "The api deployed on Tuesday. The analytics consumer, deployed weekly, threw `TypeError: Cannot read properties of undefined (reading 'split')` on every new event and its lag grew all day.",
            "On Thursday the courier-matcher team upgraded to the new schema early. It then failed validation on the OrderPlaced events from Monday, still in the topic: `must have required property 'address'`.",
            "CI's compatibility check had reported the change as compatible.",
        ]),

        h2("The core you need"),
        bullets([
            "**A schema change has a reader and a writer.** Events written with one version are read by consumers holding another. Compatibility is always a question about one pair: can this reader schema read data this writer schema produced?",
            "**The mode follows who deploys first.** BACKWARD: the new schema reads data written with the old one, so consumers upgrade first. FORWARD: the old schema reads data written with the new one, so producers upgrade first. FULL: both, so either side can go first. The Confluent Schema Registry uses BACKWARD unless you configure another level.",
            "**Transitive modes look further back.** BACKWARD, FORWARD and FULL compare the new version with the latest one only. BACKWARD_TRANSITIVE, FORWARD_TRANSITIVE and FULL_TRANSITIVE compare it with every registered version, which is what matters while the topic still holds events written with older ones.",
            "**Safe and unsafe changes.** Adding an optional field (with a default the reader can use) is safe. Removing an optional field is safe for readers that do not require it. Renaming is a removal plus an addition. Changing a field's type, or making a field required, breaks the readers that receive data without it.",
            "**A default does not satisfy `required`.** In JSON Schema `default` is an annotation: validators do not fill it in, so an event without `tip` still fails `required: [\"tip\"]`.",
            "**Tolerant readers.** A consumer that ignores fields it does not know, and reads optional fields with a fallback, survives every safe change. A change that cannot be made safe goes to a new topic (`orders.v2`): write both topics during a migration window, move each consumer, then stop writing the old one.",
        ]),

        h2("Apply it in the project"),
        p("Rice Rocket's producers and consumers release independently, and the topic keeps 7 days of events, so the subject moves to FULL_TRANSITIVE:"),
        code("bash", `
curl -s -X PUT "$REGISTRY/config/orders.v1-value" \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d '{"compatibility": "FULL_TRANSITIVE"}'
# {"compatibility":"FULL_TRANSITIVE"}`, "terminal"),
        p("The address change becomes additive: `address` joins as an optional field, `deliveryAddress` stays required until every consumer reads `address`, and `tip` stays optional:"),
        code("json", `
{
  "type": "object",
  "properties": {
    "orderId":         { "type": "string" },
    "restaurantId":    { "type": "string" },
    "deliveryAddress": { "type": "string" },
    "address":         { "type": "string", "default": "" },
    "total":           { "type": "integer" },
    "tip":             { "type": "integer", "default": 0 }
  },
  "required": ["orderId", "restaurantId", "deliveryAddress", "total"]
}`, "schemas/order-placed.v2.json"),
        p("Consumers read the new field when it is there and fall back otherwise:"),
        code("ts", `
interface OrderPlaced { orderId: string; deliveryAddress: string; address?: string; total: number; tip?: number }

export function deliveryAddressOf(order: OrderPlaced): string {
  return order.address || order.deliveryAddress;
}

export function tipOf(order: OrderPlaced): number {
  return order.tip ?? 0;
}`, "analytics/src/orderPlaced.ts"),
        callout("info", "The rules in the challenge are a simplified model",
            "The registry's JSON Schema checks also look at `additionalProperties` (open or closed content models) and at changes inside nested objects. The challenge keeps three rules - required fields, types, transitive versions - which cover the incidents in this lesson. Ask the registry with `?verbose=true` to see its own messages."),

        h2("Verify"),
        code("bash", `
# Ask the registry before registering anything
curl -s -X POST "$REGISTRY/compatibility/subjects/orders.v1-value/versions/latest?verbose=true" \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d "{\\"schemaType\\": \\"JSON\\", \\"schema\\": $(jq -c tostring schemas/order-placed.v2.json)}"
# {"is_compatible":true,"messages":[]}

# The rename alone is refused under FULL_TRANSITIVE
# {"is_compatible":false,"messages":["...deliveryAddress..."]}

# CI runs the same rules in-repo before it calls the registry
npx tsx ci/schema-compat.ts < ci/cases/order-placed-v2.json
# {"compatible":true,"problems":[]}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Switching the subject to NONE to get a release out.** The next check passes, and every consumer finds out in production. Detect it with `GET /config/<subject>` in a scheduled CI job that fails on any level other than the agreed one.",
            "**\"Required, but it has a default.\"** Defaults do not make a field present. Detect it in review: a field added to `required` in the same change that adds it to `properties` is a breaking change.",
            "**Stopping the old topic or field too early.** A migration window ends when the slowest consumer has moved, not when the producer has. Check that each consumer group's lag on `orders.v1` is zero and that its code no longer reads `deliveryAddress` before removing either.",
        ]),

        challenge("chal_quiz_kfk_171"),
        p("Now fix the CI check. The editor holds the fixed checker with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the buggy versions that let the rename through. Run feeds it schema histories, including the incident, and prints `{ compatible, problems }`."),
        challenge("chal_coding_kfk_172"),
    ],
});
