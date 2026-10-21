// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-2-2",
    title: "match/case for parsing commands",
    slug: { _type: "slug", current: "python-match-case-chat-bot-commands" },
    description:
        "Lotus Mart's chat bot crashed on a bare \"/refund\", and after a tidy-up to match/case it started answering every \"/stock\" question with a refund. Learn how structural pattern matching works - literal, capture, sequence, mapping and class patterns, guards, | and as - why a bare name in a case captures instead of compares, and how to turn chat text into safe, validated actions.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops developer, Lotus Mart team chat bot",
        problem:
            "The team chat bot answers /stock SKU, /refund ORDER_ID and /help. The old if/elif version crashed with IndexError whenever someone typed /refund without an order id, and the bot went silent until a restart. A teammate rewrote it with match/case and module constants. Now /stock MUG-01 replies \"Refund started for order MUG-01\", and a simple \"thanks!\" gets the help text. No error, no warning.",
    },

    content: [
        h2("1. The incident: a bot that refunds a coffee mug"),
        p("Lotus Mart's staff ask the chat bot about stock and start refunds from the team chat. The first version was a chain of `if` / `elif` checks on the words of the message:"),
        code("python", `
CMD_STOCK = "/stock"
CMD_REFUND = "/refund"
CMD_HELP = "/help"


def handle_v1(text):
    words = text.split()
    if words[0] == CMD_STOCK:
        return f"Checking stock for {words[1]}"
    elif words[0] == CMD_REFUND:
        return f"Refund started for order {words[1]}"
    elif words[0] == CMD_HELP:
        return "Commands: /stock SKU, /refund ORDER_ID, /help"
    else:
        return "Sorry, I don't know that command."`, "bot_v1.py"),
        p("It worked until a support agent typed just `/refund` to see what the bot would ask. `words[1]` does not exist, the handler raised `IndexError`, and the bot process stopped answering anybody. A teammate decided to \"do it properly\" with `match` / `case`, kept the constants, and shipped this:"),
        code("python", `
def handle_v2(text):
    match text.split():
        case [CMD_REFUND, order_id]:
            return f"Refund started for order {order_id}"
        case [CMD_STOCK, sku]:
            return f"Checking stock for {sku}"
        case [CMD_HELP]:
            return "Commands: /stock SKU, /refund ORDER_ID, /help"
        case _:
            return "Sorry, I don't know that command."`, "bot_v2.py"),
        p("It reads well, and the refund case even looks safer: it only matches when there are exactly two words. But the warehouse team soon noticed that asking for stock started refunds."),

        h2("2. Reproduce it"),
        p("Put both functions and the three constants in one file, add these lines and run `python repro.py`:"),
        code("python", `
print(handle_v2("/stock MUG-01"))    # Refund started for order MUG-01
print(handle_v2("/refund LM-1042"))  # Refund started for order LM-1042
print(handle_v2("thanks!"))          # Commands: /stock SKU, /refund ORDER_ID, /help
print(handle_v2("/stock"))           # Commands: /stock SKU, /refund ORDER_ID, /help
print(CMD_REFUND)                    # /refund

print(handle_v1("/refund"))
# Traceback (most recent call last):
#   ...
#     return f"Refund started for order {words[1]}"
#                                        ~~~~~^^^
# IndexError: list index out of range`, "repro.py"),
        p("Two different bugs. The old version trusts that every message has enough words: `/refund` alone, or an empty message, makes `words[0]` or `words[1]` fail. The new version never crashes, but **every two-word message is a refund** and every one-word message gets the help text. To see why, you need to know what a pattern is."),

        h2("3. match/case in one minute"),
        p("`match` (added in Python 3.10) takes one value, the **subject**, and compares it against a list of `case` **patterns** from top to bottom. The first pattern that fits wins, its block runs, and the rest are skipped. There is no fall-through to the next case and no `break` to write."),
        code("python", `
def order_status_label(status):
    match status:
        case "paid":
            return "Paid - ready to pack"
        case "shipped" | "delivered":
            return "On its way or done"
        case "cancelled":
            return "Cancelled"
        case _:
            return f"Unknown status: {status!r}"


print(order_status_label("paid"))       # Paid - ready to pack
print(order_status_label("delivered"))  # On its way or done
print(order_status_label("PAID"))       # Unknown status: 'PAID'`),
        bullets([
            "**Literal pattern** - `\"paid\"`, `42`, `None`, `True`. It matches when the subject is equal to it (`==`; `None`, `True` and `False` are compared with `is`).",
            "**OR pattern** - `\"shipped\" | \"delivered\"` matches if any of the alternatives matches.",
            "**Wildcard** - `_` matches anything and binds nothing. Put it last as the \"otherwise\" case.",
            "**No match, no error.** If no case fits and there is no `case _`, the `match` statement simply does nothing. In a function that means you fall off the end and return `None`.",
        ]),
        p("So far that is just a neater `if` / `elif`. The real power is that a pattern can describe the **shape** of the subject - a list with two items, a dict with a `\"type\"` key - and pull values out of it at the same time."),

        h2("4. Sequence patterns: matching words"),
        p("For a chat command, the natural subject is the list of words, `text.split()`. `split()` with no argument splits on any run of whitespace and drops empty strings, so `\"   \".split()` is `[]`. A **sequence pattern** in square brackets matches a list (or tuple) with the same number of items, item by item:"),
        code("python", `
def describe(text):
    match text.split():
        case []:
            return "empty message"
        case ["/stock", sku]:
            return f"stock {sku}"
        case ["/refund", order_id, *rest]:
            return f"refund {order_id}, reason words: {rest}"
        case ["/help" | "/?"]:
            return "help"
        case ["/stock" | "/sku" as command, *_]:
            return f"usage: {command} SKU"
        case [first, *_]:
            return f"unknown command {first}"


# '/stock MUG-01'                   -> stock MUG-01
# '/refund LM-1042'                 -> refund LM-1042, reason words: []
# '/refund LM-1043 wrong size sent' -> refund LM-1043, reason words: ['wrong', 'size', 'sent']
# '/?'                              -> help
# '/sku'                            -> usage: /sku SKU
# '/stock MUG-01 TEE-02'            -> usage: /stock SKU
# '   '                             -> empty message
# 'hello bot'                       -> unknown command hello`),
        bullets([
            "**Capture pattern** - a plain name such as `sku` or `order_id` matches **any** value and stores it in that variable. This is how values come out of a pattern.",
            "**Star pattern** - `*rest` collects zero or more remaining items into a list, so `[\"/refund\", order_id, *rest]` needs at least two words. `*_` accepts extra items without keeping them.",
            "**Length is checked for you.** `[\"/stock\", sku]` does not match `[\"/stock\"]`, so there is no `IndexError` to forget about.",
            "**`as`** binds whatever matched a sub-pattern: `\"/stock\" | \"/sku\" as command` tells you which spelling the user typed.",
            "**Order matters.** `/stock MUG-01 TEE-02` skips `[\"/stock\", sku]` (three words, not two) and lands in the usage case. If the usage case came first, it would also catch every correct `/stock` command.",
        ]),
        callout("info", "A string is not a sequence here",
            "Strings are sequences in Python, but sequence patterns deliberately do not match str, bytes or bytearray: match \"MUG\" never fits case [a, b, c]. That is why you match on text.split() and not on the text itself."),

        h2("5. The trap: a bare name captures, it does not compare"),
        p("Now look at the incident again. `CMD_REFUND` is a constant to you, but inside a pattern Python only sees a plain name - and a plain name is a **capture pattern**. `case [CMD_REFUND, order_id]` means \"any list of two items; call the first one `CMD_REFUND` and the second one `order_id`\". `/stock MUG-01` fits, so the refund branch runs. In the same way, `case [CMD_HELP]` matches any one-word message."),
        image("capture-vs-value-pattern", {
            alt: "Diagram with two panels for the message \"/stock MUG-01\". Left, red: case [CMD_REFUND, order_id] matches because CMD_REFUND is a bare name that captures any first word, so CMD_REFUND becomes \"/stock\", order_id becomes \"MUG-01\" and the bot replies \"Refund started for order MUG-01\". Right, green: case [Cmd.REFUND, order_id] compares Cmd.REFUND == \"/stock\", which is False, so match tries the next case, case [Cmd.STOCK, sku], where Cmd.STOCK == \"/stock\" is True, sku becomes \"MUG-01\" and the bot replies \"Checking stock for MUG-01\". Bottom: literals and dotted names such as \"/stock\", 42, None and Cmd.STOCK are compared with the value; bare names such as sku and CMD_REFUND, and the wildcard _, always match. A bare name as the whole pattern of a case that is not the last one is a SyntaxError.",
            caption: "Inside a pattern, a dotted name is compared with the subject; a bare name is a new variable that accepts anything.",
        }),
        h3("When Python warns you, and when it cannot"),
        p("If a bare name is the **whole** pattern and more cases follow, Python refuses to run the file, because every later case is unreachable:"),
        code("python", `
STATUS_PAID = "paid"

match status:
    case STATUS_PAID:        # meant: status == "paid"
        print("ship it")
    case _:
        print("wait")

#     case STATUS_PAID:
#          ^^^^^^^^^^^
# SyntaxError: name capture 'STATUS_PAID' makes remaining patterns unreachable`),
        p("The same mistake **inside** a bigger pattern, such as `[CMD_REFUND, order_id]`, is legal and silent: the list still has to have two items, so the pattern is not \"match everything\" and the compiler has nothing to complain about. That is the version that reached production."),
        p("It also overwrites the variable. A capture is an assignment. At module level, `case [STATUS_PAID]:` run against `[\"cancelled\"]` matches and leaves `STATUS_PAID == \"cancelled\"` for the rest of the program. Inside a function, the capture makes the name a **local** variable for the whole function (lesson 2.1), so a line above the `match` that reads `CMD_HELP` fails with `UnboundLocalError: cannot access local variable 'CMD_HELP' where it is not associated with a value`."),
        h3("Constants that compare: dotted names"),
        p("A name with a dot in it - `Cmd.STOCK`, `settings.PREFIX` - is a **value pattern**: Python looks up the value and compares it with `==`. The tidiest way to group command words is an enum. `StrEnum` (in the `enum` module) makes members that are real strings, so they compare equal to the text the user typed and print as plain text in f-strings:"),
        code("python", `
from enum import StrEnum


class Cmd(StrEnum):
    STOCK = "/stock"
    REFUND = "/refund"
    HELP = "/help"


print(Cmd.STOCK == "/stock")   # True
print(f"Try {Cmd.HELP}")       # Try /help


def route(text):
    match text.split():
        case [Cmd.REFUND, order_id]:      # compares: "/stock" == "/refund" -> no match
            return f"Refund started for order {order_id}"
        case [Cmd.STOCK, sku]:            # compares, then captures sku
            return f"Checking stock for {sku}"
        case _:
            return "Sorry, I don't know that command."


print(route("/stock MUG-01"))    # Checking stock for MUG-01
print(route("/refund LM-1042"))  # Refund started for order LM-1042`),
        callout("tip", "One rule to remember",
            "In a pattern, write literals (\"/stock\") or dotted names (Cmd.STOCK) for values you want to compare, and bare names only for values you want to capture. If a pattern name is in UPPER_CASE, it is almost certainly a bug."),

        h2("6. Guards and turning text into numbers"),
        p("Patterns check shape and fixed values. For anything else, add a **guard**: `case <pattern> if <condition>:`. The pattern is tried first, its captures are bound, and then the condition decides. If the guard is false, matching continues with the next case:"),
        code("python", `
def restock_reply(text):
    match text.split():
        case ["/restock", sku, qty] if qty.isascii() and qty.isdigit() and int(qty) > 0:
            return f"Adding {int(qty)} x {sku}"
        case ["/restock", sku, qty]:
            return f"Bad quantity {qty!r}: use a whole number above 0"
        case _:
            return "usage: /restock SKU QTY"


# '/restock MUG-01 24'  -> Adding 24 x MUG-01
# '/restock MUG-01 0'   -> Bad quantity '0': use a whole number above 0
# '/restock MUG-01 two' -> Bad quantity 'two': use a whole number above 0
# '/restock MUG-01'     -> usage: /restock SKU QTY`),
        p("Everything that comes out of `split()` is a `str`, even `\"24\"` (lesson 1.1: input is text). You have two common ways to turn it into an `int` safely:"),
        bullets([
            "**Check first.** `qty.isdigit()` is `True` only if every character is a digit, so `\"-2\"`, `\"2.5\"` and `\"two\"` are rejected before `int()` runs. Add `qty.isascii()`: `isdigit()` also accepts characters such as `\"²\"`, and `int(\"²\")` raises `ValueError: invalid literal for int() with base 10: '²'`.",
            "**Try it.** Call `int(text)` inside `try` / `except ValueError` (lesson 4.1 covers exceptions in depth). `int()` is more generous than you may expect: `int(\"+5\")` is `5`, `int(\"1_000\")` is `1000` and `int(\" 7 \")` is `7`, while `int(\"2.5\")` raises `ValueError: invalid literal for int() with base 10: '2.5'`.",
        ]),
        code("python", `
def to_positive_int(text):
    try:
        number = int(text)
    except ValueError:
        return None
    return number if number > 0 else None


# "24" -> 24   "007" -> 7   "0" -> None   "-2" -> None   "2.5" -> None   "+5" -> 5`),
        p("Either way, the range check (`> 0`) is a separate step. A stock quantity of `0` or `-2` is a perfectly valid integer and a perfectly wrong restock."),

        h2("7. Mapping and class patterns: JSON events"),
        p("The warehouse system also talks to the bot, by sending JSON webhooks. After `json.loads`, an event is a `dict`, and a **mapping pattern** in curly braces matches dicts by their keys:"),
        code("python", `
import json


def on_event(event):
    match event:
        case {"type": "order", "id": str(order_id), "total": int(total)}:
            return f"New order {order_id}: {total:,} VND"
        case {"type": "order", **rest}:
            return f"Order event with bad fields: {sorted(rest)}"
        case {"type": str(kind)}:
            return f"Ignoring {kind} event"
        case _:
            return "Not an event"


raw = '{"type": "order", "id": "LM-1044", "total": 459000, "city": "Đà Nẵng"}'
print(on_event(json.loads(raw)))
# New order LM-1044: 459,000 VND
print(on_event({"type": "order", "id": "LM-1045", "total": "459000"}))
# Order event with bad fields: ['id', 'total']
print(on_event({"type": "payment", "id": "PAY-77"}))
# Ignoring payment event
print(on_event(["order", "LM-1044"]))
# Not an event`),
        bullets([
            "**Extra keys are allowed.** `{\"type\": \"order\", \"id\": ...}` matches a dict that also has `\"city\"`. A missing key means no match. Use `**rest` to collect the keys you did not name.",
            "**Values are patterns too.** `\"type\": \"order\"` compares; `\"id\": order_id` would capture anything, including `None` or a number.",
            "**Class patterns check the type.** `str(order_id)` matches only a `str` and captures it; `int(total)` matches only an `int`. So `\"total\": \"459000\"` - a number sent as text - does not reach the happy path. `str()` with empty parentheses checks the type without capturing.",
            "**Mapping patterns only match mappings.** A list such as `[\"order\", \"LM-1044\"]` skips every `{...}` case.",
        ]),
        callout("warning", "True is an int",
            "bool is a subclass of int, so case int(qty) also matches True and False from JSON. If a boolean would be a bug, put a case for bool() before the int() case, or add a guard such as not isinstance(qty, bool)."),

        h2("8. Build it: the chat bot parser"),
        p("Time to write the parser the bot should have had: one function that turns chat text **or** a webhook event into an action dict, never crashes, and explains what is wrong when a command is incomplete. The tests send a whole list of messages - good commands, missing words, bad quantities, empty messages and events with the wrong types - and compare the list of results."),
        challenge("chal_coding_pyf_221", "Start with a match on the message itself: a case str() that splits it into words, and mapping cases for the restock event (class patterns plus a guard for the positive qty). Then match the words: an empty list, the complete commands, and only after them the usage cases with *_ for each command. Check the qty text before calling int(), and use literals, never bare names, for the command words."),

        h2("9. The fix"),
        p("Two changes fix both incidents: compare command words with dotted names, and add cases for incomplete commands instead of indexing into `words`:"),
        code("python", `
from enum import StrEnum


class Cmd(StrEnum):
    STOCK = "/stock"
    REFUND = "/refund"
    HELP = "/help"


HELP_TEXT = f"Commands: {Cmd.STOCK} SKU, {Cmd.REFUND} ORDER_ID [REASON], {Cmd.HELP}"


def handle(text: str) -> str:
    match text.split():
        case []:
            return ""                                   # nothing to answer
        case [Cmd.HELP, *_]:
            return HELP_TEXT
        case [Cmd.STOCK, sku]:
            return f"Checking stock for {sku}"
        case [Cmd.REFUND, order_id, *reason]:
            note = " ".join(reason) or "no reason given"
            return f"Refund started for order {order_id} ({note})"
        case [Cmd.STOCK, *_]:
            return f"usage: {Cmd.STOCK} SKU"
        case [Cmd.REFUND]:
            return f"usage: {Cmd.REFUND} ORDER_ID [REASON]"
        case [command, *_]:
            return f"Unknown command {command!r}. {HELP_TEXT}"`, "bot.py"),
        numbered([
            "**`Cmd.STOCK`, `Cmd.REFUND`, `Cmd.HELP` are value patterns.** They compare with `==`, so `/stock MUG-01` can only reach the stock case, and `thanks!` falls through to the unknown-command case.",
            "**No indexing.** Every case states how many words it needs. `/refund` alone matches `[Cmd.REFUND]` and gets a usage hint instead of an `IndexError`, and an empty message matches `[]`.",
            "**Specific cases first, catch-alls last.** The complete commands come before the usage cases, and `[command, *_]` - the only intended capture of the first word - is the last case.",
            "**Every path returns a `str`.** Because the last case catches any non-empty list and `[]` catches the empty one, the function can never fall off the end and return `None`.",
        ]),
        p("A few plain `assert` lines turn the incident into a regression test. `assert condition` does nothing when the condition is true and raises `AssertionError` when it is false:"),
        code("python", `
def test_handle():
    assert handle("/stock MUG-01") == "Checking stock for MUG-01"
    assert handle("/refund LM-1042") == "Refund started for order LM-1042 (no reason given)"
    assert handle("/refund") == "usage: /refund ORDER_ID [REASON]"
    assert handle("thanks!").startswith("Unknown command 'thanks!'")
    assert handle("   ") == ""


test_handle()   # silent when everything passes`, "bot.py"),

        h2("10. Pitfalls"),
        bullets([
            "**UPPER_CASE names in a pattern are captures.** `case [CMD_REFUND, order_id]` matches any two words and reassigns `CMD_REFUND`. Use literals or dotted names (`Cmd.REFUND`).",
            "**A catch-all case placed too early hides the ones below it.** `case [\"/refund\", *_]` above `case [\"/refund\", order_id, *reason]` turns every refund into a usage error. Python only complains when the early case is a bare name or `_` on its own.",
            "**All alternatives of `|` must bind the same names.** `case [\"/stock\", sku] | [\"/help\"]` is `SyntaxError: alternative patterns bind different names`.",
            "**`str.isdigit()` is not the same as \"`int()` will work\".** `\"²\".isdigit()` is `True` but `int(\"²\")` fails; `\"+5\".isdigit()` is `False` but `int(\"+5\")` works. Decide which inputs you accept and test them.",
            "**A valid int is not a valid quantity.** Check the range (`> 0`) in a guard or after converting.",
            "**`int()` patterns accept booleans.** `True` matches `int(qty)` because `bool` is a subclass of `int`.",
            "**A `match` with no matching case does nothing.** Without a final catch-all, a function silently returns `None`. End with `case _:` or another case that cannot fail.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Match on `text.split()`, not on indexes into it; every case states how many words it needs (`[\"/stock\", sku]`, `[\"/refund\", order_id, *reason]`, `[]`).",
            "Command words in patterns are literals or dotted names such as a `StrEnum` member, never bare module constants.",
            "Cases go from most specific to most general; usage and unknown-command cases come after the complete commands, `case _` or `[command, *_]` last.",
            "Numbers from chat text are converted safely (digit check or `try` / `except ValueError`) and range-checked before use.",
            "JSON events use mapping patterns with class patterns for types (`str(sku)`, `int(qty)`) and a guard for limits; remember extra keys are allowed.",
            "Every input - empty, too short, too long, wrong type - leads to a defined result, never an exception from inside the bot.",
            "A small test feeds the messages from the incident (`/stock MUG-01`, `/refund`, `thanks!`) and checks the replies.",
        ]),
    ],
});
