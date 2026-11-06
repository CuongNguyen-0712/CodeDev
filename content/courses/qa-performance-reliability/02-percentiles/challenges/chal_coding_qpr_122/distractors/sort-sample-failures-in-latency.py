# @piece sort-sample: Skip invalid samples, split successes from failures
if not is_valid(sample):
    invalid += 1
    continue
name = sample["endpoint"]
ok.setdefault(name, [])
failed.setdefault(name, 0)
ok[name].append(sample["ms"])
if not 200 <= sample["status"] <= 399:
    failed[name] += 1
