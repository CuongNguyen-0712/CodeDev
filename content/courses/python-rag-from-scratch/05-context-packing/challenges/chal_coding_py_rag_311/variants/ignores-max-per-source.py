# Known wrong: one long article can fill the whole context.
import json
import re
import sys


def count_tokens(text):
    return len(re.findall(r"\w+|[^\w\s]", text))


def pack_context(chunks, budget, max_per_source):
    numbers, seen, lines, used, tokens = {}, set(), [], [], 0
    for chunk in chunks:
        text, source = chunk["text"].strip(), chunk["source"]
        if text in seen:
            continue
        number = numbers.get(source, len(numbers) + 1)
        line = f"[{number}] {text}"
        cost = count_tokens(line)
        if tokens + cost > budget:
            continue
        numbers.setdefault(source, number)
        seen.add(text)
        lines.append(line)
        used.append(chunk["id"])
        tokens += cost
    return {"context": "\n".join(lines), "citations": sorted(numbers, key=numbers.get), "used": used, "tokens": tokens}


if __name__ == "__main__":
    print(json.dumps(pack_context(**json.load(sys.stdin))))
