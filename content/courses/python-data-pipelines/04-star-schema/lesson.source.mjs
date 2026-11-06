// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-2-1",
    title: "Star schemas: facts and dimensions",
    slug: { _type: "slug", current: "data-pipelines-star-schema" },
    description:
        "Rice Rocket's first reporting tables copied the app's schema, and the revenue dashboard showed three times the real number for restaurants with big orders. Learn to model for questions instead of for transactions - grain, facts, dimensions, surrogate keys and additive measures - and lay out the order star schema.",
    estimatedTime: 14,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Operations and finance query the warehouse every morning: revenue per restaurant and district, items sold, delivery times. The first tables mirrored the app's normalized schema, every question needed six joins, and two of the most-used numbers turned out to be wrong.",
    },

    content: [
        h2("Situation"),
        p("Two numbers from the Monday meeting that did not match the source:"),
        code("text", `
dashboard                                  source (app database)
revenue, Pho Ha Noi, 2026-11-04  14,950,000    5,380,000
avg delivery time, week 45        33.9 min     29.1 min`, "reconciliation"),
        p("Both came from queries that were correct SQL over a model that did not say what one row means."),

        h2("The core you need"),
        bullets([
            "**Declare the grain first.** One sentence: \"one row per order line\". Every fact column must be true at that grain, and every query that joins facts of different grains risks counting rows twice (fan-out).",
            "**Facts hold measurements.** Numbers you add up: `quantity`, `line_total_vnd`, `delivery_minutes`. Prefer additive measures (sums and counts); compute averages and ratios at query time as `SUM(...) / SUM(...)`, never by averaging averages.",
            "**Dimensions hold context.** Who, what, where, when: `dim_restaurant` (name, district, cuisine, commission), `dim_customer`, `dim_menu_item`, `dim_date` (day, week, month, holiday flags). They are wide, denormalized and small compared to facts.",
            "**Surrogate keys connect them.** Facts point to dimensions through warehouse keys (`restaurant_sk`), not the app's ids, so a dimension can keep history (next lesson) and the app can renumber without breaking reports. `dim_date` uses a readable key like `20261104`.",
            "**Degenerate dimensions.** An identifier with no attributes of its own, like `order_id`, stays on the fact row for grouping and drill-down instead of getting a table.",
        ]),

        h2("Apply it in the project"),
        code("sql", `
CREATE TABLE dim_date (
    date_key    INTEGER PRIMARY KEY,          -- 20261104
    day         DATE NOT NULL,
    iso_week    INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    is_holiday  BOOLEAN NOT NULL
);

CREATE TABLE dim_restaurant (
    restaurant_sk   INTEGER PRIMARY KEY,      -- warehouse key
    restaurant_id   INTEGER NOT NULL,         -- the app's id
    name            TEXT NOT NULL,
    district        TEXT NOT NULL,
    cuisine         TEXT NOT NULL
);

-- grain: one row per order line
CREATE TABLE fact_order_items (
    date_key        INTEGER NOT NULL REFERENCES dim_date,
    restaurant_sk   INTEGER NOT NULL REFERENCES dim_restaurant,
    customer_sk     INTEGER NOT NULL,
    item_sk         INTEGER NOT NULL,
    order_id        BIGINT  NOT NULL,         -- degenerate dimension
    quantity        INTEGER NOT NULL,
    line_total_vnd  BIGINT  NOT NULL,
    discount_vnd    BIGINT  NOT NULL
);

-- grain: one row per delivered order
CREATE TABLE fact_deliveries (
    date_key          INTEGER NOT NULL REFERENCES dim_date,
    restaurant_sk     INTEGER NOT NULL REFERENCES dim_restaurant,
    order_id          BIGINT  NOT NULL,
    delivery_minutes  INTEGER NOT NULL
);`, "warehouse/star_orders.sql"),
        p("Both Monday numbers, asked of the right grain:"),
        code("sql", `
-- revenue per restaurant and day: sum lines, no join to another fact
SELECT r.name, SUM(f.line_total_vnd - f.discount_vnd) AS revenue
FROM fact_order_items f JOIN dim_restaurant r USING (restaurant_sk)
WHERE f.date_key = 20261104
GROUP BY r.name;

-- weekly average delivery time: a ratio of sums
SELECT SUM(delivery_minutes) * 1.0 / COUNT(*) AS avg_minutes
FROM fact_deliveries f JOIN dim_date d USING (date_key)
WHERE d.iso_week = 45;`, "warehouse/queries.sql"),
        callout("info", "In dbt",
            "Each table becomes a model (`models/marts/fact_order_items.sql`) built from staging models, with tests that encode the grain: `unique` on `(order_id, item_sk)` and `relationships` from every key to its dimension."),

        h2("Verify"),
        code("bash", `
sqlite3 warehouse.db "SELECT order_id, item_sk, count(*) FROM fact_order_items GROUP BY 1, 2 HAVING count(*) > 1"
# (no rows: the grain holds)
sqlite3 warehouse.db "SELECT SUM(line_total_vnd - discount_vnd) FROM fact_order_items f
                      JOIN dim_restaurant r USING (restaurant_sk) WHERE r.restaurant_id = 101 AND date_key = 20261104"
# 5380000   (matches the source)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Facts at mixed grains in one table.** Putting the order's delivery fee on every line repeats it per dish. Keep order-level measures in an order-grain fact, or allocate them to lines with a stated rule.",
            "**Snowflaking by habit.** Splitting `dim_restaurant` into restaurant, district and city tables saves little space and adds joins to every query. Keep dimensions denormalized unless one is huge.",
            "**Unknown members.** A fact row whose customer is not in `dim_customer` yet disappears from inner joins. Add a `-1 Unknown` row to each dimension and point late or missing keys at it, then fix them later.",
        ]),

        challenge("chal_quiz_pdp_141"),
    ],
});
