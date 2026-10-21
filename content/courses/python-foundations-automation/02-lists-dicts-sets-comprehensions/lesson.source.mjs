// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json / challenges/ (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-1-2",
    title: "Lists, dicts, sets & comprehensions",
    slug: { _type: "slug", current: "python-lists-dicts-sets-comprehensions" },
    description:
        "Lotus Mart's evening restock script printed every SKU on every warehouse shelf and emailed a reorder list that missed two empty products. Learn how lists, tuples, dicts and sets work, why two names can share one list, why removing items inside a for loop skips some, and how sorted, comprehensions, Counter and defaultdict build new data safely.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops/data assistant, Lotus Mart warehouse",
        problem:
            "Every evening restock.py reads the warehouse stock sheet, prints a shelf layout for the pickers and emails the warehouse lead the SKUs that are out of stock. On Tuesday the pickers' sheet listed all five SKUs on every shelf, the email asked for COFFEE-02 only although TEA-01 and NOODLE-30 were empty too, and the \"sellable\" list still offered COFFEE-02 to customers. The script printed no error.",
    },

    content: [
        h2("1. The incident: every SKU on every shelf"),
        p("The warehouse stock sheet is a list of rows. Each row is a **tuple** - a small fixed record - with the SKU (stock keeping unit, the product code), the shelf number and the quantity left. The script does three jobs, each a few lines long:"),
        code("python", `
stock = [
    ("TEA-01", 0, 0),       # (sku, shelf, qty)
    ("COFFEE-02", 0, 0),
    ("RICE-5KG", 1, 12),
    ("NOODLE-30", 1, 0),
    ("SOY-500", 2, 3),
]

# 1. Shelf layout for the pickers: one list of SKUs per shelf
shelves = [[]] * 3
for sku, shelf, qty in stock:
    shelves[shelf].append(sku)

# 2. What can still be sold today: drop the empty rows
sellable = stock
for row in sellable:
    if row[2] == 0:
        sellable.remove(row)

# 3. Restock email: everything with qty 0
restock = [sku for sku, shelf, qty in stock if qty == 0]

print("Shelf 0:", shelves[0])
print("Shelf 2:", shelves[2])
print("Sellable:", [sku for sku, shelf, qty in sellable])
print("Restock:", restock)`, "restock.py"),
        p("Every line reads like what it should do. Three of them are wrong, and Python does not complain about any of them."),

        h2("2. Reproduce it"),
        p("Save the script and run `python restock.py`:"),
        code("text", `
Shelf 0: ['TEA-01', 'COFFEE-02', 'RICE-5KG', 'NOODLE-30', 'SOY-500']
Shelf 2: ['TEA-01', 'COFFEE-02', 'RICE-5KG', 'NOODLE-30', 'SOY-500']
Sellable: ['COFFEE-02', 'RICE-5KG', 'SOY-500']
Restock: ['COFFEE-02']`),
        p("Add one line at the end to see why: `print(shelves[0] is shelves[1], sellable is stock)` prints `True True`. The operator `is` asks \"are these the **same object**?\", not \"do they look equal?\". So the three shelves are one list, and `sellable` is just a second name for `stock`. Removing rows from `sellable` removed them from `stock`, and the email was built from what was left. The loop also skipped `COFFEE-02`, so it stayed \"sellable\". Sections 4 and 5 explain both effects."),

        h2("3. Four collections in one minute"),
        p("A **collection** holds other values. Python has four you will use every day; picking the right one prevents half of the bugs in this lesson."),
        h3("list: an ordered row of items you can change"),
        code("python", `
skus = ["TEA-01", "COFFEE-02", "RICE-5KG", "NOODLE-30", "SOY-500"]
skus[0]       # 'TEA-01'   - positions (indexes) start at 0
skus[-1]      # 'SOY-500'  - negative indexes count from the end
skus[1:3]     # ['COFFEE-02', 'RICE-5KG'] - a slice: start included, stop excluded
skus[:2]      # ['TEA-01', 'COFFEE-02']
skus[::-1][:2]  # ['SOY-500', 'NOODLE-30'] - step -1 walks backwards
len(skus)     # 5
skus[5]       # IndexError: list index out of range
skus[5:]      # [] - a slice past the end is just empty, no error`),
        p("Lists change **in place**: `append`, `remove`, `insert`, `sort` and `skus[0] = \"X\"` modify the list itself and do not create a new one."),
        h3("tuple: a fixed record"),
        p("A tuple is written with commas, usually inside parentheses. It cannot be changed after it is created, which makes it a good fit for one row of data. **Unpacking** gives each part a name:"),
        code("python", `
row = ("RICE-5KG", 1, 12)
sku, shelf, qty = row     # unpacking: sku='RICE-5KG', shelf=1, qty=12
row[2] = 0                # TypeError: 'tuple' object does not support item assignment
a, b = row                # ValueError: too many values to unpack (expected 2, got 3)
single = ("TEA-01",)      # the comma makes the tuple; ("TEA-01") is just a string`),
        h3("dict: look up a value by its key"),
        p("A **dict** (dictionary) maps keys to values, like a price list: given the SKU, find the price. Prices are in VND, so integers are exact."),
        code("python", `
prices = {"TEA-01": 45000, "RICE-5KG": 120000}
prices["TEA-01"]            # 45000
prices["SOY-500"]           # KeyError: 'SOY-500'
prices["SOY-500"] = 32000   # add or replace a key
list(prices)                # ['TEA-01', 'RICE-5KG', 'SOY-500'] - keys in insertion order
"SOY-500" in prices         # True  - in checks the KEYS
45000 in prices             # False - not the values; use 45000 in prices.values()`),
        p("A dict remembers the order in which keys were **first inserted**. Replacing the value of an existing key does not move it. That makes a dict a handy \"unique, in first-seen order\" container, which you will need in the challenge."),
        h3("set: unique items, fast membership"),
        code("python", `
tags = {"tea", "gift", "tea"}
len(tags)          # 2 - duplicates disappear
"gift" in tags     # True, and fast even for a million items
empty = set()      # {} is an empty DICT, not an empty set`),
        callout("tip", "Which one do I need?",
            "Order matters and items can repeat: list. One fixed record such as a CSV row: tuple. Find something by a key (SKU to price, city to total): dict. Only care whether something is present, or need to remove duplicates: set."),

        h2("4. Names point to objects"),
        p("This is the idea behind both incident bugs. A variable in Python is a **name** that refers to an object. `=` never copies an object; it attaches one more name to it."),
        code("python", `
a = ["TEA-01"]
b = a              # b and a are two names for ONE list
b.append("SOY-500")
print(a)           # ['TEA-01', 'SOY-500']
print(a is b)      # True  - same object
print(a == ["TEA-01", "SOY-500"])  # True - == compares contents, is compares identity`),
        p("A list does not hold its items either: it holds **references** to them. `[[]] * 3` builds a list with three references to the **same** empty list. With numbers the same trick looks fine, because you replace numbers instead of changing them:"),
        code("python", `
zeros = [0] * 3
zeros[0] = 5
print(zeros)       # [5, 0, 0] - slot 0 now points to a different number

grid = [[]] * 3
grid[0].append("X")
print(grid)        # [['X'], ['X'], ['X']] - one list, seen three times

grid = [[] for _ in range(3)]   # [] runs three times: three separate lists
grid[0].append("X")
print(grid)        # [['X'], [], []]`),
        image("one-list-three-references", {
            alt: "Diagram. Left, red: shelves = [[]] * 3. The shelves list has three slots, [0], [1] and [2], and all three arrows point to one shared list containing TEA-01, COFFEE-02, RICE-5KG, NOODLE-30 and SOY-500, so shelves[0].append(sku) also shows up on shelf 1 and shelf 2. Right, green: shelves = [[] for _ in range(3)]. Each of the three slots points to its own list: ['TEA-01', 'COFFEE-02'], ['RICE-5KG', 'NOODLE-30'] and ['SOY-500']. Bottom: sellable = stock is a second name for the same list, so removing from sellable removes from stock; stock.copy() or stock[:] makes a new outer list whose items are still the same objects (a shallow copy); copy.deepcopy(layout) copies every level, so editing the copy cannot reach layout.",
            caption: "Multiplying a list repeats references. A comprehension creates a new inner list on every step.",
        }),
        h3("Shallow copy and deep copy"),
        p("When you really need a second list, copy it. `stock.copy()`, `stock[:]` and `list(stock)` all make a **shallow copy**: a new outer list whose slots point to the same items. For tuples, strings and numbers that is enough, because nobody can change them. For a list of lists, the inner lists are still shared; `copy.deepcopy` copies every level:"),
        code("python", `
import copy

layout = [["TEA-01"], ["RICE-5KG"]]
shallow = layout.copy()
shallow[0].append("COFFEE-02")
print(layout)      # [['TEA-01', 'COFFEE-02'], ['RICE-5KG']] - inner list was shared

layout = [["TEA-01"], ["RICE-5KG"]]
deep = copy.deepcopy(layout)
deep[0].append("COFFEE-02")
print(layout)      # [['TEA-01'], ['RICE-5KG']] - untouched`),
        callout("info", "Functions get the same object",
            "Passing a list to a function passes a reference, exactly like b = a. If the function calls sort(), remove() or append() on its argument, the caller's list changes. Lesson 2.1 shows the worst version of this: a list used as a default argument."),

        h2("5. Looping without surprises"),
        h3("for, enumerate and zip"),
        p("`for item in collection` visits every item. Two helpers cover most of the other cases:"),
        code("python", `
for number, sku in enumerate(skus[:3], start=1):   # a counter AND the item
    print(number, sku)    # 1 TEA-01 / 2 COFFEE-02 / 3 RICE-5KG

names = ["TEA-01", "COFFEE-02", "RICE-5KG"]
qtys = [0, 0]                                      # one quantity is missing
list(zip(names, qtys))     # [('TEA-01', 0), ('COFFEE-02', 0)] - RICE-5KG silently disappears
list(zip(names, qtys, strict=True))
# ValueError: zip() argument 2 is shorter than argument 1`),
        p("`zip` pairs items position by position and stops at the shortest input, which hides a missing or extra row. Pass `strict=True` when the two lists must have the same length: a mismatch becomes an error instead of a wrong report."),
        h3("sorted() vs list.sort()"),
        p("`sorted(x)` returns a **new** list and leaves `x` alone. `x.sort()` sorts `x` **in place** and returns `None` - like most methods that change a list (`append`, `remove`, `reverse`)."),
        code("python", `
products = [("TEA-01", 45000), ("COFFEE-02", 45000), ("RICE-5KG", 120000), ("FISH-SAUCE", 32000)]

cheapest = sorted(products, key=lambda p: p[1])           # key: what to compare
priciest = sorted(products, key=lambda p: p[1], reverse=True)
by_price_then_name = sorted(products, key=lambda p: (p[1], p[0]))
# [('FISH-SAUCE', 32000), ('COFFEE-02', 45000), ('TEA-01', 45000), ('RICE-5KG', 120000)]

counts = [12, 0, 3]
result = counts.sort()
print(result)     # None
print(counts)     # [0, 3, 12] - the list itself was reordered
result[0]         # TypeError: 'NoneType' object is not subscriptable`),
        bullets([
            "`key=` takes a function that turns each item into the value to compare. `lambda p: p[1]` is a tiny unnamed function: \"given p, return p[1]\".",
            "A **tuple key** sorts by the first part, then breaks ties with the second: `(price, name)` gives a stable, predictable order for equal prices.",
            "`reverse=True` reverses the whole order. To sort one part descending and another ascending, negate the number: `key=lambda p: (-p[1], p[0])`.",
            "Python's sort is **stable**: items with equal keys keep their original order. Without a tie-breaker, the output depends on the input order.",
        ]),
        h3("Never remove from the list you are looping over"),
        p("A `for` loop over a list walks an internal position: 0, 1, 2, ... When you remove the item at the current position, everything after it slides one place left, and the next step jumps over the item that slid into the gap. That is what happened to `COFFEE-02`:"),
        code("text", `
step 0: looks at TEA-01 (qty 0)   -> removes it; COFFEE-02 slides to position 0
step 1: looks at RICE-5KG         -> COFFEE-02 was never checked
step 2: looks at NOODLE-30 (qty 0) -> removes it; SOY-500 slides to position 2
step 3: the list has only 3 items -> loop ends`),
        p("There is no error and no warning for lists. Dicts and sets are stricter: changing their size inside a loop over them raises `RuntimeError: dictionary changed size during iteration` (or `Set changed size during iteration`). The safe patterns:"),
        code("python", `
in_stock = [row for row in stock if row[2] > 0]   # best: build a new list, keep the old one

for row in stock[:]:          # or loop over a COPY while changing the original
    if row[2] == 0:
        stock.remove(row)`),

        h2("6. Dicts and sets at work"),
        h3("get, setdefault and in"),
        p("Most automation scripts **group** or **count** things. With a plain dict, `get(key, default)` reads a value or a default without a `KeyError`. Here, revenue per city from today's orders:"),
        code("python", `
orders = [("HN", 450000), ("DN", 120000), ("HN", 99000), ("HCM", 1250000), ("DN", 30000)]

revenue = {}
for city, amount in orders:
    revenue[city] = revenue.get(city, 0) + amount
print(revenue)    # {'HN': 549000, 'DN': 150000, 'HCM': 1250000} - first-seen order

amounts_by_city = {}
for city, amount in orders:
    amounts_by_city.setdefault(city, []).append(amount)
# setdefault returns the existing list, or inserts [] and returns that
print(amounts_by_city["HN"])   # [450000, 99000]`),
        h3("Dedupe: set loses order, dict.fromkeys keeps it"),
        p("`set(items)` removes duplicates, but a set has **no promised order**. For strings the order can even change between two runs of the same script, because Python randomises string hashing at start-up. Run `print(list({\"TEA-01\", \"RICE-5KG\", \"SOY-500\", \"COFFEE-02\"}))` a few times and compare. When the order matters, use a dict: its keys are unique and keep first-seen order."),
        code("python", `
seen = ["TEA-01", "RICE-5KG", "TEA-01", "SOY-500", "RICE-5KG"]
len(set(seen))               # 3 - fine for "how many different SKUs?"
list(dict.fromkeys(seen))    # ['TEA-01', 'RICE-5KG', 'SOY-500'] - unique AND in first-seen order`),
        h3("Counter and defaultdict"),
        p("The `collections` module has two dicts with the boring part built in:"),
        code("python", `
from collections import Counter, defaultdict

orders_per_city = Counter(city for city, amount in orders)
print(orders_per_city)                 # Counter({'HN': 2, 'DN': 2, 'HCM': 1})
print(orders_per_city["HUE"])          # 0 - a missing key counts as 0, no KeyError
print(orders_per_city.most_common(1))  # [('HN', 2)]

by_city = defaultdict(list)            # a missing key starts as list()
for city, amount in orders:
    by_city[city].append(amount)
print(by_city["HN"])                   # [450000, 99000]
print(by_city["HUE"])                  # [] - and reading it INSERTED 'HUE' into by_city`),
        p("`defaultdict(int)` starts missing keys at `0`, so `totals[key] += qty` works on the first sight of a key. Convert with `dict(by_city)` before printing or saving it as JSON, and remember that **reading** a missing key adds it."),

        h2("7. Comprehensions: build a new collection in one line"),
        p("A **comprehension** builds a new list, dict or set from another collection, optionally keeping only items that pass a test. It never changes its source, which is exactly the habit that avoids the incident."),
        code("python", `
cheap = [name for name, price in products if price < 50000]
# ['TEA-01', 'COFFEE-02', 'FISH-SAUCE']

price_of = {name: price for name, price in products if price >= 45000}
# {'TEA-01': 45000, 'COFFEE-02': 45000, 'RICE-5KG': 120000}

distinct_prices = {price for name, price in products}
# {32000, 45000, 120000} in some order - it is a set`),
        p("Read a comprehension from the middle: \"**for** name, price **in** products, **if** price < 50000, keep **name**\". Keep them short: if you need more than one `if` or two `for`s, a normal loop is easier to read. And never use a comprehension just to call a function for its side effect (`[shelves[s].append(k) for ...]`): that builds a useless list of `None`s."),

        h2("8. Build it: the restock summary"),
        p("The warehouse lead wants a cleaner email. Lotus Mart now has three warehouses (HN, DN, HCM), so one SKU can appear in several rows. Write a function that summarises the stock sheet **without changing it**. The test runner keeps a deep copy of the rows, calls your function, and reports `inputUnchanged: false` if the list was reordered, shortened or edited - even when your numbers are right."),
        challenge("chal_coding_pyf_121", "One loop with a dict that adds each row's qty to the running total for its SKU gives you both the totals and the first-seen order of the SKUs (its keys). Then keep the SKUs whose total is below the threshold and sort them with a tuple key: total first, then the SKU. Do not sort, remove from or edit the rows you were given."),

        h2("9. The fix"),
        p("Each bug gets the smallest change that removes the sharing, plus asserts that fail loudly if it ever comes back:"),
        code("python", `
import copy

stock = [
    ("TEA-01", 0, 0),       # (sku, shelf, qty)
    ("COFFEE-02", 0, 0),
    ("RICE-5KG", 1, 12),
    ("NOODLE-30", 1, 0),
    ("SOY-500", 2, 3),
]
before = copy.deepcopy(stock)

# 1. Shelf layout: a NEW empty list for every shelf
shelves = [[] for _ in range(3)]
for sku, shelf, qty in stock:
    shelves[shelf].append(sku)

# 2. Sellable: build a new list instead of removing from the one you loop over
sellable = [row for row in stock if row[2] > 0]

# 3. Restock email: stock was never changed, so every empty SKU is still there
restock = [sku for sku, shelf, qty in stock if qty == 0]

print("Shelf 0:", shelves[0])                            # ['TEA-01', 'COFFEE-02']
print("Sellable:", [sku for sku, shelf, qty in sellable])  # ['RICE-5KG', 'SOY-500']
print("Restock:", restock)                               # ['TEA-01', 'COFFEE-02', 'NOODLE-30']

assert shelves == [["TEA-01", "COFFEE-02"], ["RICE-5KG", "NOODLE-30"], ["SOY-500"]]
assert restock == ["TEA-01", "COFFEE-02", "NOODLE-30"]
assert stock == before, "restock.py must not change the stock sheet"`, "restock.py"),
        numbered([
            "**Shelves** come from a comprehension, so `[]` runs once per shelf and each shelf owns its list. `[[]] * 3` is only safe if you never change the inner lists.",
            "**Sellable** is a new list built with a filter. Nothing is removed while looping, so no row is skipped, and `stock` keeps all five rows.",
            "**Restock** reads `stock`, which is now guaranteed to be the full sheet. The last `assert` compares it with a deep copy taken at the start: if a future edit mutates the sheet again, the script stops with `AssertionError` instead of sending a wrong email.",
        ]),

        h2("10. Pitfalls"),
        bullets([
            "**`[[]] * n` and `[{}] * n` share one inner object.** Use `[[] for _ in range(n)]`. `[0] * n` is fine, because numbers are replaced, not changed.",
            "**`b = a` is not a copy.** Use `a.copy()` (or `a[:]`, `list(a)`) for one level and `copy.deepcopy(a)` when the items are lists or dicts you will change.",
            "**`x = items.sort()` sets `x` to `None`.** `sort`, `append`, `remove` and `reverse` change the list and return `None`; `sorted(items)` returns a new list.",
            "**Removing from a list inside `for` over the same list skips items** without any error. Build a new list with a comprehension, or loop over a copy.",
            "**`set()` forgets order** (and for strings the order can change between runs). Use `list(dict.fromkeys(items))` to dedupe and keep first-seen order.",
            "**`zip` silently drops the extra items** of the longer input. Use `zip(a, b, strict=True)` when the lengths must match.",
            "**A tuple is not deeply frozen.** `t = ([\"TEA-01\"], 3)` cannot get a new item 0, but `t[0].append(\"X\")` still changes the list inside it.",
        ]),

        h2("11. Checklist"),
        bullets([
            "I pick the collection by the question: ordered list, fixed tuple record, dict lookup by key, set membership/dedupe.",
            "I know `=` adds a name to an object; I copy with `.copy()` or `copy.deepcopy()` when I need my own data, and use `is` to check sharing.",
            "Nested lists are created with a comprehension, never with `[[]] * n`.",
            "I never add to or remove from a list, dict or set while looping over it; I build a new collection instead.",
            "I use `sorted(..., key=...)` with a tuple key for tie-breaks, and remember that `list.sort()` returns `None`.",
            "I read dicts with `get`, group with `setdefault` or `defaultdict(list)`, and count with `Counter`.",
            "Functions that receive a collection leave it unchanged, and a test or assert compares the input with a deep copy taken before the call.",
        ]),
    ],
});
