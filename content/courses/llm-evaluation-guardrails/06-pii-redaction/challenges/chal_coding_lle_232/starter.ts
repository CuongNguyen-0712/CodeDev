import { readFileSync } from "node:fs";

// The grading assistant logs every prompt and model output for debugging. Redact personal data
// before a line reaches the log store, and keep everything else exactly as it was.
//
// Process the types in this order, each on the text left by the previous one, finding
// non-overlapping matches from left to right:
//   EMAIL        [A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+     same value = same lowercase text
//   NATIONAL_ID  exactly 12 consecutive digits                          same value = same digits
//   PHONE        "+84" or "0", then 9 digits; each of the 9 digits may be preceded by one
//                space or one dot ("0912 345 678", "091.234.5678", "+84 912 345 678")
//                same value = "0" + the 9 digits (so "+84 912 345 678" and "0912345678" are one phone)
//   NAME         a full name from the roster, matched case- and diacritic-insensitively
// A NATIONAL_ID or PHONE match must not have a letter (A-Z, a-z), a digit, "_" or "-" right
// before or right after it: "course_079203001234" and "sub-202610270915" are ids, not personal data.
//
// Names: fold a string with s.normalize("NFD"), remove U+0300..U+036F, map "đ"/"Đ" to "d"/"D",
// then lowercase. Text and roster are NFC, so every character folds to exactly one character.
// A roster entry is trimmed; empty entries are ignored; entries that fold to the same string are
// the same person. A name matches where its folded form equals the folded text and the folded
// characters right before and after it are not a-z or 0-9. At one position, try longer names first.
//
// Replace each match with [TYPE_k]: k numbers the distinct values of that type by first
// appearance (1, 2, ...), and the same value always gets the same k in one document.
// counts = the number of replaced occurrences per type (every type present, 0 when none).
// Do not change the types or the test runner.

type PiiType = "EMAIL" | "NATIONAL_ID" | "PHONE" | "NAME";
type Redaction = { text: string; counts: Record<PiiType, number> };
type Input = { roster: string[]; text: string };

function redact(text: string, roster: string[]): Redaction {
    return { text, counts: { EMAIL: 0, NATIONAL_ID: 0, PHONE: 0, NAME: 0 } };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(redact(input.text, input.roster)));
