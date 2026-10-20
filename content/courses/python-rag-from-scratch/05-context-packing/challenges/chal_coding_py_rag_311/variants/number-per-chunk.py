# Known wrong: numbers chunks instead of sources, so two chunks of one article get two citations.
import json
import re
import sys


def count_tokens(text):
    return len(re.findall(r"\w+|[^\w\s]", text))


def pack_context(chunks, budget, max_per_source):
    citations, per_source, seen, lines, used, tokens = [], {}, set(), [], [], 0
    for chunk in chunks:
        text, source = chunk["text"].strip(), chunk["source"]
        if text in seen or per_source.get(source, 0) >= max_per_source:
            continue
        line = f"[{len(citations) + 1}] {text}"
        cost = count_tokens(line)
        if tokens + cost > budget:
            continue
        citations.append(source)
        per_source[source] = per_source.get(source, 0) + 1
        seen.add(text)
        lines.append(line)
        used.append(chunk["id"])
        tokens += cost
    return {"context": "\n".join(lines), "citations": citations, "used": used, "tokens": tokens}


if __name__ == "__main__":
    print(json.dumps(pack_context(**json.load(sys.stdin))))
