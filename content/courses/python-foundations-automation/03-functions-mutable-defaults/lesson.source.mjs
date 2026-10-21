// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-2-1",
    title: "Functions & the mutable default argument bug",
    slug: { _type: "slug", current: "python-functions-mutable-default-argument-bug" },
    description:
        "On the first day of the Tết rush, the Lotus Mart warehouse gift-wrapped 214 orders, most of which never asked for it, because once one gift order had been processed, every packing slip after it in the same run carried its \"GIFT WRAP\" note. Learn how Python functions take parameters and return values, why a default value like notes=[] is created only once, how the None default fixes it, why assigning to an outer name raises UnboundLocalError, and how to write functions that do not change the lists you pass them.",
    estimatedTime: 20,

    scenario: {
        role: "Junior ops developer at Lotus Mart, a small online shop in Vietnam",
        problem:
            "The morning import script turns the shop's order export into packing slips for the warehouse. On the first day of the Tết rush, order 167 of the run asked for gift wrap - and from then on every slip said \"GIFT WRAP\", some of them several times. The warehouse wrapped 214 orders in red Tết paper, including printer ink for an office in Đà Nẵng, and the function had passed its test that very morning.",
    },

    content: [
        h2("1. The incident"),
        p("The packing-slip function is short, and it was tested: build one slip for a gift order, check that it says \"GIFT WRAP\". The test passed."),
        code("python", `
def build_slip(order_id, sku, gift_wrap=False, notes=[]):
    if gift_wrap:
        notes.append("GIFT WRAP")
    return {"order": order_id, "sku": sku, "notes": notes}


# import_orders.py - one call per row of the shop export, all in ONE run
slips = [build_slip(row["id"], row["sku"], row["gift_wrap"] == "yes") for row in rows]`, "slips.py"),
        p("In the real run the script called `build_slip` once for each of 380 rows. Row 167 was the first gift order of the morning. Every slip from there on - gift order or not - came out with \"GIFT WRAP\" in its notes, and each further gift order added one more copy. Nothing crashed, no error was logged, and the one-slip test still passes today."),
        bullets([
            "**The bug is not in one call.** Each call on its own does the right thing. The problem is something that **survives from one call to the next**.",
            "**A one-call test cannot see it.** The test built one slip in a fresh program. The script builds hundreds in the same program.",
            "**Earlier results change, too.** Slips that were already built and stored in `slips` also show notes that were added later.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `repro.py` and run `python repro.py` (Python 3.14). The comments show the real output:"),
        code("python", `
def build_slip(order_id, sku, gift_wrap=False, notes=[]):
    if gift_wrap:
        notes.append("GIFT WRAP")
    return {"order": order_id, "sku": sku, "notes": notes}

first = build_slip("LM-1001", "TEA-500", gift_wrap=True)
print(first["notes"])                  # ['GIFT WRAP']
second = build_slip("LM-1002", "MUG-01")
print(second["notes"])                 # ['GIFT WRAP']   <- never asked for it
third = build_slip("LM-1003", "CARD-TET", gift_wrap=True)
print(first["notes"])                  # ['GIFT WRAP', 'GIFT WRAP']   <- an OLD slip changed
print(first["notes"] is third["notes"])  # True
print(build_slip.__defaults__)         # (False, ['GIFT WRAP', 'GIFT WRAP'])`, "repro.py"),
        p("The last line is the whole story. `__defaults__` is where a function keeps its default values, and the default for `notes` is not \"an empty list\" - it is **one particular list object** that already holds two notes. The rest of this lesson explains how functions work, so that this line makes complete sense - and so that you can fix it."),

        h2("3. def, return and None"),
        p("`def` creates a **function**: a named, reusable block of code. The names in parentheses are its **parameters** - the inputs it expects. When you call the function, the values you pass are called **arguments**; Python binds each parameter name to its argument and runs the body."),
        code("python", `
def order_total(prices):
    """Return the total of a list of prices in VND."""
    return sum(prices)

print(order_total([120_000, 45_000]))   # 165000`),
        bullets([
            "**`return` ends the function** and hands a value back to the caller. Code after a `return` in the same block never runs.",
            "**No `return` means `None`.** A function that ends without reaching `return` (or with a bare `return`) gives back `None`, Python's value for \"nothing\".",
            "**The first string in the body is the docstring.** It is not a comment: Python stores it in `order_total.__doc__`, and `help(order_total)` and editors show it. Say what the function returns and what it changes.",
        ]),
        h3("Forgetting return"),
        p("This is the most common function bug for beginners, and Python does not warn you:"),
        code("python", `
def order_total(prices):
    total = sum(prices)        # computed... and thrown away

result = order_total([120_000, 45_000])
print(result)                  # None
print(result + 30_000)         # TypeError: unsupported operand type(s) for +: 'NoneType' and 'int'`),
        p("The error appears where `None` is **used**, which can be far away from the function that forgot to return. When you see `'NoneType'` in an error message, check the last function that produced the value."),

        h2("4. Parameters: positional, keyword, defaults"),
        p("Python gives you several ways to pass arguments. Knowing them helps you read other people's code and design functions that are hard to call wrongly."),
        bullets([
            "**Positional**: matched by position. `build_slip(\"LM-1001\", \"TEA-500\")` - the first value goes to `order_id`, the second to `sku`.",
            "**Keyword**: matched by name, in any order. `build_slip(sku=\"TEA-500\", order_id=\"LM-1001\")`. Keywords make calls readable, especially for `True`/`False` flags.",
            "**Default values**: `gift_wrap=False` means the caller may leave it out. Parameters with defaults must come after parameters without one; `def f(a=1, b)` is a `SyntaxError: parameter without a default follows parameter with a default`.",
        ]),
        h3("Keyword-only parameters: the bare *"),
        p("A call like `notify(\"kho\", \"412 orders imported\", True)` is hard to read: what is `True`? Put a `*` in the parameter list and every parameter after it **must** be passed by name:"),
        code("python", `
def notify(channel, text, *, silent=False):
    return f"#{channel}: {text}" + (" (silent)" if silent else "")

print(notify("kho", "412 orders imported", silent=True))   # #kho: 412 orders imported (silent)
notify("kho", "412 orders imported", True)
# TypeError: notify() takes 2 positional arguments but 3 were given`),
        p("Use keyword-only parameters for flags and options. Callers can no longer mix up the order, and you can add new options later without breaking anyone."),
        h3("Positional-only parameters: the /"),
        p("The opposite marker, `/`, makes the parameters **before** it positional-only. You mostly meet it in the documentation of built-ins: `help(len)` shows `len(obj, /)`, which means you cannot write `len(obj=items)`. In your own code it lets you rename a parameter later without breaking callers:"),
        code("python", `
def vat(amount_vnd, /, rate_percent=8):
    return amount_vnd * rate_percent // 100

print(vat(250_000))            # 20000
vat(amount_vnd=250_000)
# TypeError: vat() got some positional-only arguments passed as keyword arguments: 'amount_vnd'`),
        h3("*args and **kwargs"),
        p("`*name` collects any extra positional arguments into a **tuple**, and `**name` collects any extra keyword arguments into a **dict**. The names `args` and `kwargs` are only a convention:"),
        code("python", `
def log_event(event, *details, **fields):
    print(event, details, fields)

log_event("import_done", "orders.csv", 412, failed=0, run="08:02")
# import_done ('orders.csv', 412) {'failed': 0, 'run': '08:02'}`),
        p("They are useful for wrappers that pass everything on to another function. For ordinary functions, prefer explicit parameters: they document themselves, and a typo in a name is an error (`TypeError: notify() got an unexpected keyword argument 'slient'. Did you mean 'silent'?`) instead of a silently ignored option."),

        h2("5. Default values are evaluated once"),
        p("Here is the rule behind the incident: **Python evaluates a default value one time, when the `def` statement runs** - usually when the module is loaded - and stores the result on the function. It does not evaluate it again for each call."),
        p("For `False`, `0`, `\"\"` or `None` that makes no difference: those values cannot be changed. A list, a dict or a set can be changed in place. So `notes=[]` means \"every call that leaves out `notes` gets **this one list**\", and `notes.append(...)` changes that one list for all future calls - and for every slip that already holds a reference to it."),
        image("default-evaluated-once", {
            alt: "Two panels. Left, in red, titled def build_slip(..., notes=[]): three calls - call 1 for LM-1001 with gift, call 2 for LM-1002, call 3 for LM-1003 with gift - all point with arrows to one shared list stored in build_slip.__defaults__, which holds GIFT WRAP from call 1 and GIFT WRAP from call 3; a note says LM-1002 asked for nothing but its slip shows both notes. Right, in green, titled def build_slip(..., notes=None): the same three calls each point to their own new list - GIFT WRAP, empty, GIFT WRAP - so nothing leaks between orders. A bottom panel lists the same rule for other defaults: counts={} is one dict for every call, created_at=datetime.now() is evaluated once so every call gets the same timestamp, and x=None followed by creating the value inside the function gives each call its own.",
            caption: "The default list lives on the function. Default to None and create the list inside the call.",
        }),
        h3("The same bug with a dict"),
        code("python", `
def count_by_sku(rows, counts={}):
    for row in rows:
        counts[row["sku"]] = counts.get(row["sku"], 0) + row["qty"]
    return counts

print(count_by_sku([{"sku": "TEA-500", "qty": 2}]))   # {'TEA-500': 2}
print(count_by_sku([{"sku": "MUG-01", "qty": 1}]))    # {'TEA-500': 2, 'MUG-01': 1}  <- TEA from the first file`),
        h3("The same bug with time"),
        p("A default does not have to be a list to be wrong. `datetime.now()` in a default is called once, when the module loads:"),
        code("python", `
import time
from datetime import datetime

def stamp_export(name, created_at=datetime.now()):
    return f"{name} exported at {created_at:%H:%M:%S}"

print(stamp_export("orders.csv"))   # orders.csv exported at 08:02:11
time.sleep(2)
print(stamp_export("stock.csv"))    # stock.csv exported at 08:02:11   <- same second, 2 s later`),
        h3("The fix: None as a sentinel"),
        p("A **sentinel** is a special value that means \"the caller did not pass anything\". In Python that value is `None`. Default to `None`, then create the real value **inside** the function, so every call gets a fresh one:"),
        code("python", `
def stamp_export(name, created_at=None):
    if created_at is None:
        created_at = datetime.now()     # runs on every call
    return f"{name} exported at {created_at:%H:%M:%S}"`),
        callout("tip", "Use is None, not or",
            "You will see notes = notes or [] in real code. It works for None, but it also replaces an empty list, 0 or \"\" that the caller passed on purpose, because they are all falsy. The check if notes is None: says exactly what you mean: replace the value only when nothing was passed."),

        h2("6. Scope: local and global names"),
        p("A **scope** is the region of code where a name is visible. Names created inside a function - its parameters and every variable it assigns - are **local**: they exist only while that call runs. Names created at the top level of a file are **global** to that module. A function can **read** a global name freely."),
        p("The surprise comes when a function **assigns** to a name. Python decides which names are local when it compiles the function, before any line runs: if a name is assigned **anywhere** in the body (with `=`, `+=`, a `for` loop variable...), it is local in the **whole** body. Then reading it before the assignment fails:"),
        code("python", `
imported = 0

def record_import(count):
    imported += count      # += assigns, so 'imported' is local in this function

record_import(412)
# UnboundLocalError: cannot access local variable 'imported' where it is not associated with a value`, "counter.py"),
        p("Calling a method on a global object is different: `seen_skus.add(sku)` does not assign to the **name** `seen_skus`, it changes the set the name points to, so it works. That is exactly why mutable state shared between calls is easy to create by accident."),
        h3("global is a smell"),
        p("`global imported` at the top of the function makes the error go away by telling Python to assign the module variable. It works, but now the function's result depends on hidden state: run the import twice in one program and the count is doubled, and a test has to reset the global first. Return the value instead and let the caller decide where to keep it:"),
        code("python", `
def import_rows(rows):
    # ... save the rows ...
    return len(rows)

imported = import_rows(rows)       # the caller owns the number`),
        challenge("chal_quiz_pyf_211", "For each name, ask two questions: when was its value created, and is it assigned anywhere inside the function?"),

        h2("7. Functions that change their arguments"),
        p("When you pass a list to a function, the function does not get a copy. The parameter is a second name for **the same list** (the aliasing you met in the lesson on lists and dicts). So a function can change the caller's data:"),
        code("python", `
def discount_in_place(prices, percent):
    for i in range(len(prices)):
        prices[i] = prices[i] * (100 - percent) // 100

def discounted(prices, percent):
    return [price * (100 - percent) // 100 for price in prices]

cart = [120_000, 45_000]
print(discounted(cart, 10), cart)   # [108000, 40500] [120000, 45000]
discount_in_place(cart, 10)
print(cart)                         # [108000, 40500]`),
        p("`discounted` is a **pure function**: its result depends only on its arguments, and it changes nothing outside itself. Pure functions are easy to test and safe to call twice. `discount_in_place` **mutates** (changes) its argument; that is sometimes what you want, but then the name and the docstring must say so, and it should return `None` - like `list.sort()` - so nobody mistakes it for a function that returns a new list."),
        h3("+= on a list changes it in place"),
        p("For numbers and strings, `x += y` makes a new value. For a list, `+=` **extends the same list**, just like `.extend()`. Only `x = x + y` builds a new list:"),
        code("python", `
def add_fragile(notes):
    notes += ["FRAGILE"]       # extends the caller's list
    return notes

mine = ["GIFT WRAP"]
add_fragile(mine)
print(mine)                    # ['GIFT WRAP', 'FRAGILE']`),
        p("If a function needs to add items to a list it received, it should first make its own copy - `list(notes)` or `notes.copy()` - and change the copy. The caller's list stays exactly as it was."),

        h2("8. The fix"),
        p("Here is the packing-slip function written so that every call is independent:"),
        code("python", `
def build_slip(order_id, sku, *, gift_wrap=False, notes=None):
    """Return a new packing slip for one order.

    notes: extra notes for this slip. The caller's list is copied, never changed.
    """
    slip_notes = [] if notes is None else list(notes)
    if gift_wrap:
        slip_notes.append("GIFT WRAP")
    return {"order": order_id, "sku": sku, "notes": slip_notes}


def test_slips_are_independent():
    first = build_slip("LM-1001", "TEA-500", gift_wrap=True)
    second = build_slip("LM-1002", "MUG-01")            # same run, no gift wrap
    fragile = ["FRAGILE"]
    third = build_slip("LM-1003", "VASE-01", gift_wrap=True, notes=fragile)

    assert first["notes"] == ["GIFT WRAP"]
    assert second["notes"] == []
    assert third["notes"] == ["FRAGILE", "GIFT WRAP"]
    assert fragile == ["FRAGILE"]                       # the caller's list is untouched


test_slips_are_independent()
print("ok")                                             # ok`, "slips.py"),
        numbered([
            "**`notes=None`** - the default is the sentinel, so no list is shared between calls.",
            "**`[] if notes is None else list(notes)`** - every call works on its own list: a new empty one, or a copy of what the caller passed. `list(...)` copies the list itself (a shallow copy), which is enough for a list of strings.",
            "**`*, gift_wrap=False`** - the flag is keyword-only, so `build_slip(\"LM-1\", \"TEA-500\", True)` is a `TypeError` instead of a guess.",
            "**The docstring states the contract**: what comes back, and that the argument is not changed.",
            "**The test calls the function several times in one program** - the only way to catch state that leaks from one call to the next. A test that builds a single slip would pass with the buggy version.",
        ]),

        h2("9. Your turn"),
        p("The order builder in the import script has the same family of bugs, plus one more: the script passes the **same** campaign tag list for every campaign row. The test runner calls the function once per row in one process, like the real script, and prints every order and the campaign list at the end."),
        challenge("chal_fix_pyf_212", "Run the starter in your head for two rows in a row: which list objects does each order end up holding? Each order needs a list that belongs to it alone, and the caller's list must look the same after the run as before it."),

        h2("10. Pitfalls"),
        bullets([
            "**`[]`, `{}` or `set()` as a default value**: one object shared by every call. Default to `None` and create it inside.",
            "**`datetime.now()`, `uuid4()` or any function call as a default**: it runs once, when `def` runs, not on each call.",
            "**`x = x or []`**: also replaces an empty list, `0` or `\"\"` that the caller passed on purpose. Use `if x is None`.",
            "**Appending to a list you received** (or `+=` on it): you change the caller's data. Copy first, or name the function so it is obvious it mutates.",
            "**Forgetting `return`**: the function gives back `None`, and the error appears later, wherever `None` is used.",
            "**Assigning to an outer name inside a function**: `UnboundLocalError`. Return the new value instead of reaching for `global`.",
            "**Testing with one call**: shared-state bugs only show up on the second call in the same process.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every function that computes something ends with `return` - and says in its docstring what it returns.",
            "No mutable default values: lists, dicts and sets default to `None` and are created inside the function.",
            "No function calls in default values; defaults are constants such as `None`, `0`, `False` or a string.",
            "Flags and options are keyword-only (after `*`).",
            "Functions do not change lists or dicts they were given, unless their name and docstring say so - and then they return `None`.",
            "No `global`: functions take inputs as parameters and hand results back with `return`.",
            "Tests call the function several times in one run and check that earlier results and the caller's data did not change.",
        ]),
    ],
});
