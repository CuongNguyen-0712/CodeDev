"""Check that every number in the assistant's answer comes from a source it cites."""
import json
import re
import sys

MARKER = re.compile(r"\[(\d+)\]")
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def split_sentences(answer: str) -> list[str]:
    """A sentence ends with . ! or ? followed by whitespace (do not change)."""
    return [sentence for sentence in re.split(r"(?<=[.!?])\s+", answer.strip()) if sentence]


def parse_context(context: str) -> dict[int, list[str]]:
    """Citation number -> every packed line of that source (a source can have several chunks)."""
    sources: dict[int, list[str]] = {}
    for line in context.splitlines():
        match = re.match(r"\[(\d+)\] (.*)", line)
        if match:
            sources.setdefault(int(match.group(1)), []).append(match.group(2))
    return sources


def check_citations(context: str, answer: str) -> list[dict]:
    """One {"sentence", "problem"} per answer sentence whose citations or numbers do not check out."""
    sources = parse_context(context)
    problems = []
    for index, sentence in enumerate(split_sentences(answer), start=1):
        cited = [int(n) for n in MARKER.findall(sentence)]
        facts = NUMBER.findall(MARKER.sub("", sentence))
        if any(n not in sources for n in cited):
            problems.append({"sentence": index, "problem": "unknown_source"})
        elif facts and not cited:
            problems.append({"sentence": index, "problem": "uncited"})
        else:
            # only the cited sources count, and numbers are compared whole: "3" is not "30"
            supported = " ".join(line for n in cited for line in sources[n])
            if any(fact not in supported for fact in facts):
                problems.append({"sentence": index, "problem": "unsupported"})
    return problems


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(check_citations(**case)))
