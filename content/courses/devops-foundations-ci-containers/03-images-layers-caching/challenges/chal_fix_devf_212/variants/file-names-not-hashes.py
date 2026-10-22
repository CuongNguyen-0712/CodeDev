"""
Rice Rocket's CI prints a "build plan" before every image build: which Dockerfile steps the layer
cache will reuse and which ones will run again. Today the plan lies. After a code change it says
"pip install: CACHED", the build then spends 4 minutes in pip, and once it even promised a cached
COPY . . for a commit that changed app/main.py.

The plan compares two builds of the same project: the previous build (its Dockerfile and the files in
its build context) and the current one. Files are given as {"path": "content hash"}.

Cache rules (the classic Docker layer cache, simplified):
  - Every step has a cache key made of three parts:
      1. the key of the step before it (the parent; None for the first step),
      2. the instruction text, exactly as written,
      3. for COPY and ADD only: the (path, content hash) pairs of every file the step copies,
         sorted by path. Other instructions have an empty tuple here.
  - A step is CACHED when the previous build produced a step with exactly the same key. Because the
    parent is part of the key, once one step runs again, every step after it runs again too.
  - The files a COPY/ADD step copies:
      * the sources are the words between the instruction name and the destination (the last word);
        words that start with "--" (like --chown=app:app) are options, not sources;
      * a file matches a source when the source is "." (the whole context), when the source is a
        glob that matches the path (see glob_match below: "*.py" matches "manage.py" but not
        "app/main.py"), or when the path is inside the directory the source names ("app" and "app/"
        both match "app/main.py"). A plain file name is a glob without wildcards.
  - Files ignored by .dockerignore never reach the build: they are not in the context, so they are
    never copied and their changes never bust the cache. A path is ignored when a pattern matches it
    with glob_match ("*.md" ignores "README.md", not "docs/setup.md") or when the path is inside the
    directory the pattern names (".git" ignores ".git/HEAD").

The report:
  {"steps": ["CACHED <instruction>" or "BUILD <instruction>", ... one per current step],
   "rebuilt": number of BUILD steps,
   "build_seconds": sum of seconds[i] for every BUILD step i}

Example: previous and current Dockerfile are ["FROM python:3.13-slim", "WORKDIR /app", "COPY . .",
"RUN pip install -r requirements.txt"], seconds [2, 1, 1, 240], and only app/main.py changed
  -> steps CACHED, CACHED, BUILD, BUILD; rebuilt 2; build_seconds 241
"""
import fnmatch
import json
import sys


def glob_match(path, pattern):
    """Docker-style glob: like fnmatch, but * and ? never cross a "/"."""
    return path.count("/") == pattern.count("/") and fnmatch.fnmatch(path, pattern)


def inside(path, directory):
    """True when path is the directory itself or a file somewhere below it."""
    directory = directory.rstrip("/")
    return path == directory or path.startswith(directory + "/")


def is_ignored(path, patterns):
    return any(glob_match(path, p) or inside(path, p) for p in patterns)


def copied_files(instruction, files, dockerignore):
    """The (path, hash) pairs a COPY/ADD instruction sends, sorted by path."""
    words = [w for w in instruction.split()[1:] if not w.startswith("--")]
    sources = words[:-1]
    picked = []
    for path, digest in files.items():
        if is_ignored(path, dockerignore):
            continue  # not in the build context at all
        if any(src == "." or glob_match(path, src) or inside(path, src) for src in sources):
            picked.append((path, digest))
    return sorted(picked)


def step_keys(dockerfile, files, dockerignore):
    keys = []
    for instruction in dockerfile:
        if instruction.split()[0].upper() in ("COPY", "ADD"):
            content = tuple(path for path, _ in copied_files(instruction, files, dockerignore))
        else:
            content = ()
        parent = keys[-1] if keys else None
        keys.append((parent, instruction, content))
    return keys


def build_report(previous, current, dockerignore, seconds):
    old_keys = set(step_keys(previous["dockerfile"], previous["files"], dockerignore))
    new_keys = step_keys(current["dockerfile"], current["files"], dockerignore)
    steps = []
    rebuilt = 0
    build_seconds = 0
    for key, instruction, duration in zip(new_keys, current["dockerfile"], seconds):
        if key in old_keys:
            steps.append(f"CACHED {instruction}")
        else:
            steps.append(f"BUILD {instruction}")
            rebuilt += 1
            build_seconds += duration
    return {"steps": steps, "rebuilt": rebuilt, "build_seconds": build_seconds}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: previous, current, dockerignore, seconds) from stdin and prints the plan.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(build_report(case["previous"], case["current"], case["dockerignore"], case["seconds"])))
