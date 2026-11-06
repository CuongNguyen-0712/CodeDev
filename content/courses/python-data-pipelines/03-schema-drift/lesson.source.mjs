// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-1-3",
    title: "Schema drift: new and renamed columns",
    slug: { _type: "slug", current: "data-pipelines-schema-drift" },
    description:
        "A POS vendor renamed and moved a column in its menu export overnight, and Rice Rocket's loader put prices into the availability column without a single error. Learn to load files against a column contract - match by name and alias, refuse what is missing, add what is new, quarantine bad rows - and write the menu loader.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Partner restaurants upload a nightly menu export from their point-of-sale system; the warehouse uses it for menu analytics and price checks. One morning every dish of 340 restaurants showed a price of 0 or 1 VND in the dashboard.",
    },

    content: [
        h2("Situation"),
        p("The vendor's release notes, read too late, and the two files side by side:"),
        code("text", `
POS export v4.2: column "price" renamed to "unit_price"; new column "discount_vnd".

menu_2026-11-04.csv                                   menu_2026-11-05.csv
restaurant_id,item_code,item_name,price,available     restaurant_id,item_code,item_name,available,unit_price,discount_vnd
101,PHO-01,Pho bo tai,55000,true                      101,PHO-01,Pho bo tai,true,58000,5000`, "uploads"),
        p("The loader read columns by position, so `available` went into `price_vnd` (as 1) and the real price into `available`:"),
        code("python", `
reader = csv.reader(f)
next(reader)                                       # skip the header
for row in reader:
    wh.execute("INSERT INTO stg_menu_items VALUES (?, ?, ?, ?, ?)", row[:5])   # position 3 = price`, "pipelines/load_menu.py"),

        h2("The core you need"),
        bullets([
            "**Schema drift is normal.** Sources you do not own add, rename, reorder and retype columns. The loader decides what happens; silently loading whatever lands in a position is the worst option.",
            "**Write the contract down.** For each target column: its type, whether it is required, and the source names you accept for it (aliases you have seen, like `price` and `unit_price`). Match by header name, after trimming and lowercasing.",
            "**Classify each change.** A missing required column is breaking: refuse the file and alert. A new column is additive: keep it (add a nullable column, or park it in a JSON `extras` column) and report it so someone decides what it means. A renamed column is a missing one plus a new one until you add the alias.",
            "**Rows can drift too.** Convert each value by the contract; a row that fails goes to a rejected list with its line and reason. Decide a threshold (here 5%): above it the file is probably broken as a whole and should not be loaded at all.",
            "**The same idea elsewhere.** dbt model contracts (`contract: { enforced: true }`), BigQuery and Delta Lake schema evolution options, and Avro or JSON Schema compatibility checks all encode this decision: what may change without a human looking at it.",
        ]),

        h2("Apply it in the project"),
        code("python", `
CONTRACT = {
    "restaurant_id": {"type": "int",  "required": True,  "aliases": []},
    "item_code":     {"type": "str",  "required": True,  "aliases": ["sku"]},
    "item_name":     {"type": "str",  "required": True,  "aliases": ["name"]},
    "price_vnd":     {"type": "int",  "required": True,  "aliases": ["price", "unit_price"]},
    "available":     {"type": "bool", "required": False, "aliases": []},
}

def resolve(header):
    names = {alias: col for col, spec in CONTRACT.items() for alias in [col, *spec["aliases"]]}
    return {i: names.get(h.strip().lower(), h.strip().lower()) for i, h in enumerate(header)}

def load_file(wh, header, rows):
    mapping = resolve(header)
    missing = [c for c, s in CONTRACT.items() if s["required"] and c not in mapping.values()]
    if missing:
        return {"status": "rejected", "reason": "missing required column: " + ", ".join(missing)}
    good, bad = split_rows(mapping, rows)            # convert by type, keep "line n: why"
    if rows and len(bad) / len(rows) > 0.05:
        return {"status": "rejected", "reason": f"{len(bad)} of {len(rows)} rows failed checks"}
    with wh:
        added = add_new_columns(wh, mapping)        # ALTER TABLE ... ADD COLUMN, nullable
        upsert(wh, good)                             # ON CONFLICT (restaurant_id, item_code)
    return {"status": "loaded", "loaded": len(good), "rejected_rows": bad, "new_columns": added}`, "pipelines/load_menu.py"),
        callout("info", "Alert on the report, not only on failures",
            "A loaded file with `new_columns: [\"discount_vnd\"]` is a success that still needs a person. Send the load report to the data channel; a refused file pages the on-call."),

        h2("Verify"),
        code("bash", `
python -m pipelines.load_menu uploads/menu_2026-11-05.csv
# {"status": "loaded", "loaded": 2911, "rejected_rows": [], "new_columns": ["discount_vnd"]}
sqlite3 warehouse.db "SELECT min(price_vnd), max(price_vnd) FROM stg_menu_items"
# 15000|420000        (no prices of 0 or 1)
python -m pipelines.load_menu uploads/menu_broken.csv
# {"status": "rejected", "reason": "missing required column: price_vnd"}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`SELECT *` into a table.** It ties the load to column order and count; the next added column fails with a column-count error or, worse, shifts values. Name the columns on both sides.",
            "**Aliases that collide.** If a future file has both `price` and `unit_price`, two source columns map to `price_vnd` and the last one wins silently. Refuse a file where two columns resolve to the same target.",
            "**Type checks that are too forgiving.** Parsing `\"45k\"` with a regex that strips letters loads 45 VND. Fail the row and let the rejected list show the value.",
        ]),

        p("Now write the menu loader. The editor starts from `pipelines/load_menu.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the positional loader's habits on purpose. Run loads a sequence of files, including the renamed, moved and extended export, and prints the table after each."),
        challenge("chal_coding_pdp_132"),
    ],
});
