"""
A secret scanner for the layers of a Rice Rocket image.

An image is a stack of layers. Each layer adds or changes files, and may delete paths that earlier
layers added. Deleting a path in a later layer does NOT remove it from the image: the earlier layer
still contains the file, and anyone who pulls the image can unpack that layer. So the scanner looks
at every file in every layer, and tells you whether the file is still visible in the final image.

Input: the layers in build order (the first layer is the bottom of the stack):

    [{"created_by": "COPY . /app",
      "files": {"app/.env": "DEBUG=0\\nDB_PASSWORD=Pr0d-Rice-2026\\n", "app/logo.png": null},
      "deleted": []},
     {"created_by": "RUN rm -f /app/.env",
      "files": {},
      "deleted": ["app/.env"]}]

  - "files" maps a path to the file's text. null means a binary file: skip it.
  - "deleted" lists paths that this layer removes. Deleting a directory ("app/secrets") removes
    every file below it ("app/secrets/key.pem"), but not "app/secrets-old/key.pem".
  - A layer may leave out "files" or "deleted"; treat a missing one as empty.
  - Paths never start with "/". A deleted path may end with "/".

Rules, checked on every line of every text file (split the text with str.splitlines()):

  "aws-access-key-id"   the line contains AWS_KEY_ID (see below), e.g. AKIAIOSFODNN7EXAMPLE
  "private-key"         the line contains PRIVATE_KEY, e.g. -----BEGIN RSA PRIVATE KEY-----
  "secret-assignment"   the whole line matches ASSIGNMENT (NAME=value, optionally "export NAME=value"),
                        NAME contains one of SECRET_WORDS, and the value - stripped of spaces and
                        then of quote characters (" and ') at both ends - is not empty and does
                        not start with "$" (${DB_PASSWORD} is a reference to a variable, not a secret).

A line can match more than one rule; report each matching rule once, in the order above.

A file found in layer i is still in the final image unless a later layer either deletes it (its
path or a directory above it) or adds a file with the same path (the newer file hides the older one;
the older content is still inside layer i).

Output:
    {"findings": [{"layer": 1, "path": "app/.env", "line": 2, "rule": "secret-assignment",
                   "in_final_image": false}, ...],
     "total": number of findings,
     "hidden": number of findings with in_final_image false}

"layer" is 1-based. Order: by layer, then by path (sorted as Python sorts strings), then by line,
then by rule order. Never print the secret itself.
"""
import json
import re
import sys

AWS_KEY_ID = re.compile(r"AKIA[0-9A-Z]{16}")
PRIVATE_KEY = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
ASSIGNMENT = re.compile(r"\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=(.*)")
SECRET_WORDS = ("SECRET", "PASSWORD", "TOKEN")


def rules_for_line(line):
    """The rule names this one line matches, in rule order (an empty list when none)."""
    # TODO: AWS_KEY_ID, then PRIVATE_KEY, then a NAME=value line whose NAME contains a word of
    # SECRET_WORDS and whose value is a real value (not empty, not a $reference).
    return []


def inside(path, directory):
    """True when path is the directory itself or a file somewhere below it."""
    directory = directory.rstrip("/")
    return path == directory or path.startswith(directory + "/")


def in_final_image(path, index, layers):
    """Is the file that layers[index] added at path still visible in the final image?"""
    # TODO: look at every layer after index.
    return True


def scan_image(layers):
    # TODO: today the scanner only looks at the final filesystem and finds nothing. Scan every text
    # file of every layer, line by line, and report each finding with in_final_image.
    return {"findings": [], "total": 0, "hidden": 0}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"layers": [...]}) from stdin and prints the scan result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(scan_image(case["layers"]), ensure_ascii=False))
