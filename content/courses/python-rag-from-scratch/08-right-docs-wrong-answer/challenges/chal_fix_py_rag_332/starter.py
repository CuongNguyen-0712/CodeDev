"""
Check that every number in the assistant's answer comes from a source it cites.

The context is the output of pack_context() (lesson 3.1): one line "[n] text" per packed chunk,
where n is the citation number of the chunk's source - two chunks of the same source share n.
The answer is the model's reply, with markers such as [2] after the claims they support.

In the "Right Docs, Wrong Answer?" incident this check passed "refunds arrive within 30 days [4]."
although source [4] never says 30 days. It also accepts "3 days [1]" when source 1 says 30 days,
and it flags correct sentences whose number is in the first of two chunks from the same source.

Intended behaviour, per sentence of the answer (numbered from 1):
  - citations = the [n] markers; facts = the numbers (NUMBER) in the sentence without its markers.
  - "unknown_source" if a cited n has no line in the context; otherwise
  - "uncited" if the sentence has facts but no citation; otherwise
  - "unsupported" if a fact is not one of the numbers found in the text of the cited sources
    (all of their lines), compared as whole numbers: 3 is not 30.
  - Return one {"sentence", "problem"} per sentence with a problem, in sentence order.
"""
import json
import re
import sys

MARKER = re.compile(r"\[(\d+)\]")
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def split_sentences(answer: str) -> list[str]:
    """A sentence ends with . ! or ? followed by whitespace (do not change)."""
    return [sentence for sentence in re.split(r"(?<=[.!?])\s+", answer.strip()) if sentence]


def parse_context(context: str) -> dict[int, str]:
    sources: dict[int, str] = {}
    for line in context.splitlines():
        match = re.match(r"\[(\d+)\] (.*)", line)
        if match:
            sources[int(match.group(1))] = match.group(2)
    return sources


def check_citations(context: str, answer: str) -> list[dict]:
    sources = parse_context(context)
    everything = " ".join(sources.values())
    problems = []
    for index, sentence in enumerate(split_sentences(answer), start=1):
        cited = [int(n) for n in MARKER.findall(sentence)]
        facts = NUMBER.findall(MARKER.sub("", sentence))
        if any(n not in sources for n in cited):
            problems.append({"sentence": index, "problem": "unknown_source"})
        elif facts and not cited:
            problems.append({"sentence": index, "problem": "uncited"})
        elif any(fact not in everything for fact in facts):
            problems.append({"sentence": index, "problem": "unsupported"})
    return problems


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(check_citations(**case)))
