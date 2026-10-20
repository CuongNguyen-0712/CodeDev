# Known wrong: stops at the first chunk that does not fit, so smaller chunks after it are lost.
import json
import re
import sys


def count_tokens(text):
    return len(re.findall(r"\w+|[^\w\s]", text))


def pack_context(chunks, budget, max_per_source):
    numbers, per_source, seen, lines, used, tokens = {}, {}, set(), [], [], 0
    for chunk in chunks:
        text, source = chunk["text"].strip(), chunk["source"]
        if text in seen or per_source.get(source, 0) >= max_per_source:
            continue
        number = numbers.get(source, len(numbers) + 1)
        line = f"[{number}] {text}"
        cost = count_tokens(line)
        if tokens + cost > budget:
            break
        numbers.setdefault(source, number)
        per_source[source] = per_source.get(source, 0) + 1
        seen.add(text)
        lines.append(line)
        used.append(chunk["id"])
        tokens += cost
    return {"context": "\n".join(lines), "citations": sorted(numbers, key=numbers.get), "used": used, "tokens": tokens}


if __name__ == "__main__":
    print(json.dumps(pack_context(**json.load(sys.stdin))))
