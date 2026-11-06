// @piece file-metadata: Before the first hunk: status and binary markers
if (line.startsWith("@@")) inHunks = true;
else if (line === "--- /dev/null") current.status = "added";
else if (line === "+++ /dev/null") current.status = "deleted";
else if (line.startsWith("Binary files ")) current.binary = true;
