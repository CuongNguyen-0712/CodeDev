// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-1-1",
    title: "Values, strings & f-strings",
    slug: { _type: "slug", current: "python-values-strings-f-strings" },
    description:
        "Lotus Mart's sales bot told the whole team that one thermos sold for 175,000,175,000 VND, then crashed the next morning on a price written as \"210.000\". Learn Python's basic value types, why everything a script reads is text until you convert it, truthiness, string methods and slicing, and how f-string format specs print aligned, readable numbers - with money kept in exact integers.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops/data assistant at Lotus Mart, a small online shop in Vietnam",
        problem:
            "A short Python script reads yesterday's order rows from the shop admin's text export and posts a sales summary to the team chat. On Monday it announced \"Revenue: 175000175000\" for a single order of two thermos bottles. A colleague's quick fix crashed with a TypeError, and after that was patched the script died on Tuesday with a ValueError, because the export now writes prices as \"210.000\". The receipt lines it posts never line up either.",
    },

    content: [
        h2("1. The incident: 175 billion dong for two bottles"),
        p("Lotus Mart's admin panel can export yesterday's orders as plain text, one order line per row: product name, quantity and unit price, separated by `;`. A small script turns those rows into a summary for the `#sales` channel. Its first version, for a single row, was four lines long:"),
        code("python", `
row = "Bình giữ nhiệt;2;175000"        # one line of the export
name, qty, price = row.split(";")
print(name + " x" + qty)
print("Revenue: " + price * int(qty))`, "daily_summary.py"),
        p("On Monday the channel read `Revenue: 175000175000`. Nobody sold 175 billion dong of thermos bottles: Python repeated the **text** `\"175000\"` twice instead of multiplying the **number** 175000 by 2. A colleague changed the last line to `\"Revenue: \" + int(price) * int(qty)` and the script stopped with a `TypeError`. After that was fixed with `str(...)`, Tuesday's export arrived with prices formatted the Vietnamese way - `210.000` - and the script crashed with a `ValueError`. Every bug has the same root: the script never decided **where text stops and numbers begin**."),

        h2("2. Reproduce it"),
        p("Save this as `repro.py` and run `python repro.py` (Python 3.14):"),
        code("python", `
rows = [
    "Bình giữ nhiệt;2;175000",
    "Cà phê hạt 500g ; 3 ; 210.000",
    "Túi vải canvas;2;35000",
]

name, qty, price = rows[0].split(";")
print(type(qty), type(price))      # <class 'str'> <class 'str'>
print(f"{qty=} {price=}")          # qty='2' price='175000'
print("Revenue: " + price * int(qty))
# Revenue: 175000175000

amount = int(price) * int(qty)
print(amount)                      # 350000
print("Revenue: " + amount)
# TypeError: can only concatenate str (not "int") to str`, "repro.py"),
        p("And the second row, the one from Tuesday:"),
        code("python", `
name, qty, price = rows[1].split(";")
print(repr(name), repr(qty), repr(price))
# 'Cà phê hạt 500g ' ' 3 ' ' 210.000'
int(price)
# ValueError: invalid literal for int() with base 10: ' 210.000'

for row in rows:
    n, q, p = row.split(";")
    print(n + " x" + q + " = " + p)
# Bình giữ nhiệt x2 = 175000
# Cà phê hạt 500g  x 3  =  210.000
# Túi vải canvas x2 = 35000`),
        p("Three symptoms, one cause: `split` returns pieces of **text**, with whatever spaces and separators the export contained. The script then used them as if they were numbers, and glued output together with `+`, so nothing lines up."),

        h2("3. Values and types"),
        p("Every value in Python has a **type**, which decides what you can do with it. The built-in function `type(value)` tells you which one. The five you meet first:"),
        bullets([
            "**`int`** - whole numbers of any size: `3`, `-7`, `1_050_000` (underscores are allowed in number literals, only for readability).",
            "**`float`** - numbers with a fractional part, stored in binary: `3.0`, `0.1`, `1e3` (that is 1000.0).",
            "**`str`** - text, a sequence of Unicode characters: `\"Mug\"`, `'Đà Nẵng'`, `\"175000\"`, and the empty string `\"\"`.",
            "**`bool`** - `True` or `False`, the result of comparisons such as `qty > 0`.",
            "**`None`** - the single value of type `NoneType`, meaning \"no value here\" (a missing discount, a function that returns nothing). Test for it with `x is None`.",
        ]),
        code("python", `
print(type(3), type(3.0), type("3"), type(True), type(None))
# <class 'int'> <class 'float'> <class 'str'> <class 'bool'> <class 'NoneType'>

print(7 / 2, 7 // 2, 7 % 2, 2 ** 10)   # 3.5 3 1 1024
print(10 / 5, type(10 / 5))            # 2.0 <class 'float'>  (/ always gives a float)
print(None == 0)                       # False: None is not zero, not "", not False`),
        p("The same characters can be different values: `3` is a number, `\"3\"` is a one-character piece of text. Operators follow the type, not what the value looks like: `+` adds two ints but **joins** two strings, and `*` multiplies two ints but **repeats** a string."),
        code("python", `
print(10 + 5)          # 15
print("10" + "5")      # 105
print("175000" * 2)    # 175000175000
print("12" < "9")      # True: strings compare character by character, and "1" < "9"
print(12 < 9)          # False`),

        h2("4. Everything from outside is text"),
        p("A script never receives numbers from the outside world. `input()` returns a `str`. Every field of a CSV file is a `str`. Every argument in `sys.argv` (the words after `python script.py` on the command line) is a `str`. A chat message is a `str`. If you want a number, **you** convert it, once, as soon as you read it:"),
        image("text-in-numbers-inside", {
            alt: "Diagram in three panels with arrows between them. Panel 1, Text in: the export row \"Cà phê hạt 500g ; 3 ; 210.000\" is split on semicolons into three strings, name = 'Cà phê hạt 500g ', qty = ' 3 ' and price = ' 210.000'; the type of qty is str. Panel 2, Numbers inside: int(' 3 ') gives 3, ' 210.000'.strip().replace('.', '') gives '210000', int('210000') gives 210000, and 3 * 210000 gives 630000; VND kept as int is exact. Panel 3, Text out: f\"{amount:,}\" gives '630,000', f\"{amount:>12,}\" right-aligns it in 12 characters, f\"{name:<18}\" pads the name to 18, so columns line up. A red panel at the bottom shows what happens when step 2 is skipped: '175000' * 2 gives '175000175000', \"Revenue: \" + 350000 raises TypeError: can only concatenate str (not \"int\") to str, and int(' 210.000') raises ValueError: invalid literal for int() with base 10: ' 210.000'.",
            caption: "Convert text to numbers once, right after reading it; compute with numbers; turn them back into text only when you print.",
        }),
        h3("Converting: int(), float(), str()"),
        p("The type names are also functions that build a value of that type. They are strict, and the errors they raise are your friends - a crash is better than a wrong total:"),
        code("python", `
int(" 42 ")       # 42        surrounding spaces and new lines are ignored
int("+3")         # 3
int("1_000")      # 1000      underscores between digits are accepted too
int("12.5")       # ValueError: invalid literal for int() with base 10: '12.5'
int("1,050,000")  # ValueError: invalid literal for int() with base 10: '1,050,000'
int("")           # ValueError: invalid literal for int() with base 10: ''
float("12.5")     # 12.5
int(float("12.5"))  # 12   int() of a float cuts the fraction off, it does not round
str(1050000)      # '1050000'`),
        p("Notice that `int()` is more forgiving than \"only digits\": it accepts a sign, spaces and underscores. When a rule says a field must contain **only the digits 0-9**, check the text itself with a string method before you convert:"),
        code("python", `
"12".isdecimal()    # True
"2.5".isdecimal()   # False
"-1".isdecimal()    # False
"+2".isdecimal()    # False
"".isdecimal()      # False`),
        p("Going the other way, `+` never turns a number into text for you. `\"Total: \" + 3` raises `TypeError: can only concatenate str (not \"int\") to str`, and `3 + \"5\"` raises `TypeError: unsupported operand type(s) for +: 'int' and 'str'`. Use `str(3)` or, better, an f-string (section 7)."),

        h2("5. Truthiness: what counts as false"),
        p("`if` and `while` accept any value, not only `True` and `False`. Python treats a small set of values as **falsy** and everything else as **truthy**. `bool(value)` shows which one a value is:"),
        code("python", `
print(bool(0), bool(0.0), bool(""), bool(None), bool([]))   # False False False False False
print(bool("0"), bool(" "), bool("False"), bool(-1))         # True True True True`),
        p("Falsy: zero of any number type, the empty string, `None`, and empty collections (`[]`, `{}`, and so on). Truthy: everything else - including the strings `\"0\"`, `\" \"` and `\"False\"`, because they are non-empty text. That is exactly the trap with values read from outside: a quantity of `\"0\"` from a chat command is truthy until you convert it with `int()`."),
        callout("tip", "Say what you mean in conditions",
            "Use if not name: when you really mean \"empty string\", if qty == 0: when you mean the number zero, and if discount is None: when you mean \"no value\". A discount of 0 is falsy too, so if not discount: cannot tell \"no discount set\" from \"discount of zero\"."),
        challenge("chal_quiz_pyf_111", "For each value, first ask: is it a str or a number right now? Then apply the truthiness rule and the conversion rules from sections 4 and 5."),

        h2("6. Working with strings"),
        h3("Strings are immutable"),
        p("A `str` cannot be changed in place. `s[0] = \"X\"` raises `TypeError: 'str' object does not support item assignment`. Every string method returns a **new** string and leaves the original alone, so you must keep the result:"),
        code("python", `
name = "  Mug  "
name.strip()            # returns 'Mug', but name is still '  Mug  '
name = name.strip()     # keep the result
print(repr(name))       # 'Mug'`),
        h3("The methods you will use every day"),
        code("python", `
"  Mug \\t".strip()                  # 'Mug'        removes spaces, tabs and new lines at both ends
"ĐÀ NẴNG".lower()                   # 'đà nẵng'
"Straße".lower(), "Straße".casefold()   # ('straße', 'strasse')  casefold is for comparing
"a;b;;c".split(";")                 # ['a', 'b', '', 'c']   one piece per separator, even empty ones
"  a   b ".split()                  # ['a', 'b']            no argument: split on any run of whitespace
"210.000".replace(".", "")          # '210000'
"SKU-123".startswith("SKU-")        # True
"SKU-123".removeprefix("SKU-")      # '123'
"175.000đ".removesuffix("đ")        # '175.000'   unchanged if the suffix is not there
", ".join(["Mug", "Tee", "Bag"])    # 'Mug, Tee, Bag'
"Mug" in "Mug 350ml"                # True`),
        p("`lower()` is fine for display. For comparing text typed by people, `casefold()` is the stronger version (lesson 3.2 goes deeper into cleaning names and Vietnamese accents). `split(sep)` with an argument keeps empty pieces, so `\"2;;35000\".split(\";\")` has three fields, the middle one empty - useful when you need to notice a missing field."),
        h3("Indexing and slicing"),
        p("A string is a sequence: `s[i]` is the character at position `i`, counting from 0, and negative positions count from the end. A **slice** `s[start:stop]` takes characters from `start` up to, but not including, `stop`; either end can be left out."),
        code("python", `
shop = "lotus mart"
shop[0]       # 'l'
shop[-1]      # 't'
shop[:5]      # 'lotus'
shop[-4:]     # 'mart'
shop[::-1]    # 'tram sutol'   a third number is the step
shop[10:]     # ''             slices never fail: out of range gives an empty string
shop[10]      # IndexError: string index out of range`),

        h2("7. f-strings and format specs"),
        p("An **f-string** is a string literal with an `f` before the quote. Every `{expression}` inside it is evaluated and turned into text, so you never need `str()` and `+`:"),
        code("python", `
name, qty, amount = "Mug", 3, 75000
print(f"{name} x{qty} = {amount} VND")    # Mug x3 = 75000 VND
print(f"{qty * 25000}")                   # 75000   any expression works`),
        p("After the expression you can add `:` and a **format spec**, a mini-language that controls how the value is written:"),
        code("python", `
f"{1050000:,}"          # '1,050,000'   thousands separator
f"{1050000:_}"          # '1_050_000'
f"{3.14159:.2f}"        # '3.14'        2 digits after the point (f = fixed-point)
f"{'Mug':>10}|"         # '       Mug|'  right-align in 10 characters
f"{'Mug':<10}|"         # 'Mug       |'  left-align
f"{'Mug':^10}|"         # '   Mug    |'  centre
f"{1050000:>12,}|"      # '   1,050,000|'  align and separators combine
f"{'Bình giữ nhiệt 1 lít':<10.10}|"   # 'Bình giữ n|'  .10 on a str: cut to 10 characters`),
        p("Read a spec left to right: alignment (`<` left, `>` right, `^` centre), width, then `,` or `_` for grouping, then `.` precision and a type letter. Numbers are right-aligned by default and strings left-aligned, but writing `<` or `>` makes the intent obvious. On a **string**, precision means \"at most this many characters\" - the way to stop one long product name from pushing a whole column to the right."),
        p("Vietnamese readers write `1.050.000`. The format spec only knows `,` and `_`, so format with `,` and swap the character afterwards: `f\"{1050000:,}\".replace(\",\", \".\")` gives `'1.050.000'`."),
        h3("The = specifier for debugging"),
        p("`{expr=}` prints the expression, an `=` and the **repr** of its value - the form that shows quotes around strings. It is the quickest way to see whether a value is text or a number:"),
        code("python", `
qty = "3"
amount = 350000
print(f"{qty=}")          # qty='3'      the quotes tell you it is still a str
print(f"{amount=:,}")     # amount=350,000`),
        callout("info", "Python 3.14: template strings are not strings",
            "Python 3.14 adds template string literals (PEP 750), written with a t prefix: t\"Hi {name}\". They look like f-strings, but the result is a string.templatelib.Template object, not a str: its .strings and .values hold the text and the evaluated values separately, so a library can escape the values before combining them (for HTML or SQL, for example). \"x\" + t\"...\" raises a TypeError. For printing a report you want an f-string; you will only meet t-strings in libraries built for them."),

        h2("8. Money: integers, not floats"),
        p("A `float` stores numbers in binary, and most decimal fractions have no exact binary form. The errors are tiny, but they show up in comparisons and in rounding:"),
        code("python", `
print(0.1 + 0.2)            # 0.30000000000000004
print(0.1 + 0.2 == 0.3)     # False
print(1.1 * 3)              # 3.3000000000000003
print(round(2.675, 2))      # 2.67   2.675 is stored as 2.67499999...`),
        p("Vietnamese dong has no fractional unit in everyday prices, so Lotus Mart keeps every amount as an **`int` of VND**: `175000`, never `175000.0` and never `175.0` thousand. Integer arithmetic is exact at any size. When you do need fractions (a 7.5% fee, or prices in another currency), use integer cents or the standard library's `decimal.Decimal`, created **from a string**:"),
        code("python", `
from decimal import Decimal

print(Decimal("0.1") + Decimal("0.2"))   # 0.3
print(Decimal(0.1))   # 0.1000000000000000055511151231257827021181583404541015625
                      # built from a float, it copies the float's error`),
        p("Formatting for display (`:,` or `.2f`) happens at the very end, on the way out. It never changes the value you computed with."),

        h2("9. Build it: an aligned receipt for the chat"),
        p("Staff also paste order lines straight into the chat, in a slightly different shape: `name | quantity | unit price`, typed by hand, with stray spaces, prices like `210,000`, `210.000` or `35.000 đ`, and the occasional mistake. Write the function that turns such a paste into receipt lines whose columns line up, plus a total. Invalid lines must not crash the script and must not be silently counted: report their line numbers. The starter's docstring gives the exact column layout and the rule for a valid line."),
        p("You will need a loop over the lines: `for number, raw in enumerate(text.splitlines(), start=1):` gives you each line with its line number, starting at 1. Lesson 1.2 covers loops and lists properly."),
        challenge("chal_coding_pyf_112", "Handle one line at a time: skip blank lines first, then split on the bar and check the number of fields. Clean each field with strip(), clean the price with removesuffix() and replace(), and decide validity with isdecimal() before calling int() - int() alone accepts signs. Build each output line with a single f-string; a precision on the name keeps long names inside their column."),

        h2("10. The fix"),
        p("The summary script gets the same three steps as the diagram: text in, numbers inside, text out."),
        code("python", `
rows = [
    "Bình giữ nhiệt;2;175000",
    "Cà phê hạt 500g ; 3 ; 210.000",
    "Túi vải canvas;2;35000",
]

revenue = 0
for row in rows:
    name, qty_text, price_text = row.split(";")
    name = name.strip()
    qty = int(qty_text)                                   # int() ignores the spaces in " 3 "
    price = int(price_text.strip().replace(".", ""))      # "210.000" -> 210000 VND
    amount = qty * price
    revenue += amount
    print(f"{name:<18}{qty:>4} x {price:>9,}{amount:>12,}")

print(f"{'Revenue':<34}{revenue:>12,}")

assert revenue == 1_050_000
assert f"{revenue:,}" == "1,050,000"`, "daily_summary.py"),
        code("text", `
Bình giữ nhiệt       2 x   175,000     350,000
Cà phê hạt 500g      3 x   210,000     630,000
Túi vải canvas       2 x    35,000      70,000
Revenue                              1,050,000`),
        numbered([
            "**Text in.** `split(\";\")` gives three `str` values; `strip()` removes the spaces the export put around them.",
            "**Numbers inside.** `int()` converts quantity and price once, right after reading. The `.` thousands separator is removed first, because `int(\"210.000\")` is a `ValueError`, not 210000. From here on every calculation is `int` arithmetic, so `qty * price` multiplies instead of repeating text.",
            "**Text out.** One f-string per line: the name is padded to 18 characters, the numbers are right-aligned with `,` separators, and the revenue line is padded so its number ends in the same column. In the chat (with a monospaced code block) the columns line up.",
            "**A small test.** The two `assert` lines stop the script with an `AssertionError` if a future change breaks the total or its formatting. A bad row still stops the script with a clear `ValueError`; lesson 4.1 shows how to report bad rows and keep going.",
        ]),

        h2("11. Pitfalls"),
        bullets([
            "**`str * int` repeats text.** `\"175000\" * 2` is `'175000175000'`, with no error. If a total looks absurd, print it with `{value=}` and check for quotes.",
            "**`\"0\"` is truthy.** Any non-empty string is true in an `if`, including `\"0\"` and `\"False\"`. Convert first, then test the number.",
            "**`int()` accepts more than digits.** It allows `\"+3\"`, `\" 42 \"` and `\"1_000\"`. Use `isdecimal()` when a rule says \"digits only\".",
            "**`int()` does not understand separators or decimals.** `\"1,050,000\"`, `\"210.000\"` and `\"12.5\"` all raise `ValueError`; remove separators with `replace()` before converting, and decide explicitly what a decimal point means in your data.",
            "**String methods do not change the string.** `name.strip()` on its own line does nothing useful; write `name = name.strip()`.",
            "**Float money drifts.** `0.1 + 0.2 != 0.3`. Keep VND in `int`, other currencies in integer cents or `Decimal(\"...\")` built from a string.",
            "**A format spec is not rounding your data.** `f\"{x:.2f}\"` only changes the text that is printed; the value you compute with is unchanged.",
        ]),

        h2("12. Checklist"),
        bullets([
            "I know the five basic types (`int`, `float`, `str`, `bool`, `None`) and check one with `type()` or `{value=}`.",
            "Every value read from `input()`, a file, a CSV, `sys.argv` or a chat is a `str` until I convert it, once, right after reading.",
            "I validate digits with `isdecimal()` and remove thousands separators before `int()`.",
            "My conditions say what they mean: `== 0`, `is None` or an empty check, never a truthiness test on unconverted text.",
            "I keep the result of every string method (`s = s.strip()`), and use `strip`, `split`, `replace`, `removeprefix`/`removesuffix`, `startswith`, `join` and slicing to clean text.",
            "I build output with f-strings: `<` / `>` and a width for columns, `,` for thousands, `.2f` for decimals, `.N` to cut long text.",
            "Money is an `int` of VND (or integer cents, or `Decimal` from a string), never a `float`.",
        ]),
    ],
});
