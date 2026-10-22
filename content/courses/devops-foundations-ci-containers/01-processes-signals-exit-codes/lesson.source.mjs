// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-1-1",
    title: "Processes, signals & exit codes",
    slug: { _type: "slug", current: "devops-processes-signals-exit-codes" },
    description:
        "Rice Rocket's deploy job went green while the database migration had failed, and every deploy waited 10 seconds for the api container to stop before it died with exit code 137. Learn how Linux runs processes, what exit codes and signals mean, why a pipeline hides failures without pipefail, how set -euo pipefail and trap make shell scripts honest, and why PID 1 in a container must handle SIGTERM.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On Friday evening a deploy of the api service ran the database migration with ./migrate.sh | tee migrate.log. The migration failed halfway, but the CI job was green, the new code went out, and for 25 minutes every order page returned 500 because a column was missing. While rolling back, the team noticed a second problem: every docker stop of the api container took exactly 10 seconds, ended with Exited (137), and dropped the orders that were in flight.",
    },

    content: [
        h2("1. The incident"),
        p("Rice Rocket deploys the `api` service from a CI job. The migration step keeps a copy of its output in a log file, so someone wrote it with `tee`:"),
        code("yaml", `
# .github/workflows/deploy.yml (excerpt)
    steps:
      - name: Migrate database
        run: ./migrate.sh | tee migrate.log
      - name: Deploy api
        run: ./deploy.sh api`, "deploy.yml"),
        p("Two things went wrong that evening, and neither was a bug in the application code:"),
        bullets([
            "**The failed migration looked successful.** `migrate.sh` stopped with `ERROR: column \"tip_amount\" already exists` and exit code 1. But the step's result is the exit status of the **whole pipeline**, and without `pipefail` that is the status of the **last** command - `tee`, which happily wrote the log and exited 0. The step was green, and the deploy step ran on a half-migrated database.",
            "**The container would not stop politely.** The api image starts with `CMD [\"./start.sh\"]`, a small shell script that runs gunicorn. On every deploy, `docker stop` waited 10 seconds, then the container showed `Exited (137)`. The orders that gunicorn was serving at that moment were cut off mid-request.",
        ]),
        p("Both problems are about the same two things: **exit codes** (how a process says whether it worked) and **signals** (how the system asks a process to stop). This lesson covers both."),

        h2("2. Reproduce it"),
        p("You can reproduce the first problem in any bash shell. `false` is a command that does nothing and exits with 1:"),
        code("bash", `
$ false | tee out.log
$ echo $?
0
$ false | tee out.log; echo "\${PIPESTATUS[@]}"
1 0
$ set -o pipefail
$ false | tee out.log; echo $?
1`),
        p("`$?` is the exit status of the last pipeline - 0, even though the first command failed. `PIPESTATUS` is a bash array with the status of **every** command in the last pipeline: `1 0`. With `pipefail` on, the pipeline reports the failure."),
        p("The second problem needs Docker. This is the api image, simplified:"),
        code("dockerfile", `
FROM python:3.13-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["./start.sh"]`, "Dockerfile"),
        code("bash", `
#!/bin/sh
python manage.py migrate --check
gunicorn api:app --bind 0.0.0.0:8000`, "start.sh"),
        code("bash", `
$ docker run -d --name api rice-rocket/api:dev
$ time docker stop api
api

real    0m10.312s
user    0m0.031s
sys     0m0.016s
$ docker ps -a --filter name=api --format '{{.Status}}'
Exited (137) 5 seconds ago`),
        p("Ten seconds is not a coincidence: it is Docker's default grace period. By the end of the lesson you will know exactly why, and the one-word fix."),

        h2("3. Processes and PIDs"),
        p("Every running program on Linux is a **process**. The kernel gives each one a number, the **PID** (process ID), and remembers which process started it, the **PPID** (parent PID). `ps` lists them:"),
        code("bash", `
$ ps -o pid,ppid,stat,cmd -u deploy
    PID    PPID STAT CMD
   2104    2098 Ss   -bash
   2231    2104 S+   ./migrate.sh
   2232    2104 S+   tee migrate.log
   2240    2231 R+   python manage.py migrate`),
        bullets([
            "**Both sides of a pipe run at the same time.** `migrate.sh` (2231) and `tee` (2232) are two separate processes started by the same shell; the pipe connects one's stdout to the other's stdin.",
            "**Children inherit from parents.** `migrate.sh` started `python` (2240), so 2231 is its PPID. The environment, the working directory and open files are copied into the child.",
            "**When a process ends, it leaves an exit code** for its parent to collect. A shell stores it in `$?`.",
        ]),
        p("Inside a container, your command usually runs as **PID 1** - the first process in its own PID namespace. Many slim images do not ship `ps`, so ask Docker from the host instead:"),
        code("bash", `
$ docker top api -o pid,ppid,cmd
PID      PPID     CMD
41872    41850    /bin/sh ./start.sh
41901    41872    /usr/local/bin/python /usr/local/bin/gunicorn api:app --bind 0.0.0.0:8000`),
        p("`docker top` shows host PIDs, but the structure is what matters: the **shell** running `start.sh` is the container's main process (PID 1 inside the container), and gunicorn is only its child. Remember this picture for section 7."),

        h2("4. Exit codes"),
        p("An **exit code** (or exit status) is a number from 0 to 255 that a process returns when it ends. There is only one rule that every tool agrees on: **0 means success, anything else means failure**. Scripts, `set -e`, CI runners, `docker run` and Kubernetes all decide \"did it work?\" from this number alone."),
        code("bash", `
$ ls /app; echo $?
manage.py  start.sh
0
$ ls /nope; echo $?
ls: cannot access '/nope': No such file or directory
2
$ ./deploy.sh; echo $?
bash: ./deploy.sh: Permission denied
126
$ deplyo.sh; echo $?
bash: deplyo.sh: command not found
127`),
        p("Beyond 0, a few ranges have a conventional meaning:"),
        bullets([
            "**1-125: the program's own failure codes.** 1 is a general error. Some tools use more: `grep` returns 1 for \"no match\" and 2 for a real error such as a missing file; `ls` returns 2 for a missing path. Read the man page before treating every non-zero code the same way.",
            "**126: found, but not executable** - usually a script without the execute bit (`chmod +x deploy.sh` fixes it) or a file for another CPU architecture.",
            "**127: command not found** - a typo, a missing package, or a `PATH` that does not include the tool.",
            "**128 + N: killed by signal N.** The shell reports a process that was ended by a signal as 128 plus the signal number: 130 is 128 + 2 (SIGINT, Ctrl+C), 137 is 128 + 9 (SIGKILL), 143 is 128 + 15 (SIGTERM). Docker uses the same convention for a container's exit code.",
            "**Only 0-255 exist.** `exit 256` gives 0 and `exit 300` gives 44 - the number is taken modulo 256. Never compute an exit code from a count of errors.",
        ]),
        p("Python follows the same rules. A script that ends normally exits with 0; an uncaught exception prints a traceback and exits with 1; `sys.exit(3)` exits with 3; and `sys.exit(\"migration failed\")` prints the message to stderr and exits with 1."),
        code("python", `
import sys

def main():
    applied = run_migrations()
    if applied is None:
        print("migration failed, see migrate.log", file=sys.stderr)
        return 1
    print(f"applied {applied} migrations")
    return 0

if __name__ == "__main__":
    sys.exit(main())     # the return value becomes the exit code`, "migrate.py"),
        callout("tip", "Translate an exit code quickly",
            "In bash, kill -l 137 prints KILL and kill -l 143 prints TERM: give it an exit code above 128 and it names the signal. In Python, signal.Signals(137 - 128).name gives 'SIGKILL'. (The challenge below uses its own short table of signal names instead, so it gives the same answer on every operating system.)"),

        h2("5. Pipelines, set -euo pipefail and trap"),
        p("A shell script runs one command after another and, by default, **ignores failures**: if line 3 fails, line 4 still runs. For a deploy script that is almost never what you want. Three options at the top of the script change that:"),
        code("bash", `
#!/usr/bin/env bash
set -euo pipefail

./migrate.sh | tee migrate.log      # a failing migrate.sh now stops the script
./deploy.sh "$SERVICE"              # stops if SERVICE is not set`, "release.sh"),
        bullets([
            "**`set -e` (errexit)**: stop the script as soon as a command fails, and exit with that command's code.",
            "**`set -u` (nounset)**: using a variable that was never set is an error, instead of silently expanding to an empty string. `rm -rf \"$BUILD_DIR/\"` with a typo in the name is the classic disaster this prevents.",
            "**`set -o pipefail`**: the status of a pipeline is the status of the **rightmost command that failed**, or 0 if all succeeded. Without it, only the last command counts.",
        ]),
        image("pipeline-status", {
            alt: "Diagram of the pipeline ./migrate.sh | tee migrate.log. migrate.sh exits with 1 because the column tip_amount already exists, tee exits with 0, and PIPESTATUS is 1 0. Left panel, red, default bash: the pipeline status is the last command's status, 0, so set -e does not stop, the CI step is green and deploy.sh runs on a half-migrated database. Right panel, green, set -o pipefail: the pipeline status is the rightmost non-zero status, 1, so set -e stops the script, the CI step is red and the deploy never starts. A note at the bottom: in a pipeline like 3 | 1 | 0, pipefail reports 1, the rightmost failure, not the first.",
            caption: "Without pipefail, the last command decides. With pipefail, any failure in the pipeline fails the step.",
        }),
        h3("Where set -e does not stop"),
        p("`set -e` ignores a failure when the command is **tested**, because then you are handling the result yourself:"),
        bullets([
            "in the condition of `if`, `while` or `until`: `if grep -q ready status.txt; then ...`",
            "on the left of `&&` or `||`: `./notify.sh || true` deliberately ignores a failing notification",
            "after `!`: `! grep -q ERROR app.log`",
        ]),
        p("That is useful, and also a trap: `./migrate.sh && echo done` does **not** stop the script when the migration fails. Write the important commands on their own line."),
        h3("CI runners and the shell"),
        p("On a Linux runner, GitHub Actions runs a `run:` step with `bash -e {0}` when you do not set `shell:` - errexit, but **no pipefail**, which is exactly how the incident happened. With `shell: bash` written explicitly, it uses `bash --noprofile --norc -eo pipefail {0}`. Set it once for the whole workflow:"),
        code("yaml", `
defaults:
  run:
    shell: bash          # adds -eo pipefail to every run: step`, "deploy.yml"),
        h3("trap: clean up whatever happens"),
        p("`trap` runs a command when the script receives a signal or exits. The `EXIT` trap runs on a normal end **and** when `set -e` stops the script, so it is the place for cleanup:"),
        code("bash", `
#!/usr/bin/env bash
set -euo pipefail

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT        # always removed, success or failure

pg_dump "$DATABASE_URL" > "$workdir/backup.sql"
./migrate.sh | tee "$workdir/migrate.log"`, "migrate-with-backup.sh"),

        h2("6. Signals"),
        p("A **signal** is a small message the kernel delivers to a process: \"stop\", \"reload\", \"the pipe you write to is closed\". Each has a number and a name; `kill -l` lists them. These are the ones you will meet in operations:"),
        bullets([
            "**SIGTERM (15)** - \"please terminate\". The polite stop: the default of `kill`, of `docker stop` and of Kubernetes. A program can catch it, finish its current work and exit cleanly.",
            "**SIGINT (2)** - what Ctrl+C sends to the program in your terminal. Python turns it into `KeyboardInterrupt`.",
            "**SIGKILL (9)** - \"stop now\". It cannot be caught, blocked or trapped: the kernel ends the process immediately. No cleanup, no `finally`, no `trap` runs. This is the last resort, after SIGTERM was ignored.",
            "**SIGHUP (1)** - originally \"the terminal hung up\"; many daemons (nginx, for example) use it to mean \"reload your configuration\".",
            "**SIGPIPE (13)** - the reader of a pipe went away. `yes | head -1` ends `yes` with SIGPIPE, which is normal; with `pipefail` it shows up as 141 (128 + 13).",
        ]),
        code("bash", `
$ kill 41901            # sends SIGTERM (15)
$ kill -TERM 41901      # the same, by name
$ kill -9 41901         # SIGKILL: no cleanup possible
$ kill -l 9
KILL`),
        p("In a shell script, `trap` can react to signals too. This one stops a long loop cleanly when the script gets SIGTERM or SIGINT:"),
        code("bash", `
stop=0
trap 'stop=1' TERM INT
while [ "$stop" -eq 0 ]; do
    ./process-next-batch.sh
done
echo "stopped after the current batch"`),

        h2("7. Stopping a container: why PID 1 matters"),
        p("`docker stop api` does three things:"),
        numbered([
            "It sends **SIGTERM** (or the signal set by the image's `STOPSIGNAL`) to the container's main process - PID 1 inside the container.",
            "It waits for the **grace period**: 10 seconds by default. `docker stop -t 30 api` waits 30; Compose has `stop_grace_period`, Kubernetes has `terminationGracePeriodSeconds` (30 seconds by default).",
            "If the process is still running, it sends **SIGKILL**. The container exits with 137.",
        ]),
        p("PID 1 is special. The Linux kernel protects the first process of a PID namespace: a signal whose default action would end it is **ignored unless that process installed a handler for it**. Only SIGKILL (and SIGSTOP) sent from outside the container get through regardless. A normal program relies on the default action of SIGTERM - \"terminate\" - so as PID 1 it simply does not react."),
        p("Now look at the api container again. PID 1 is `/bin/sh ./start.sh`. The shell has no handler for SIGTERM, so the signal is ignored. The shell is also not designed to pass signals on to its children, so gunicorn never hears about it. Ten seconds later, SIGKILL ends everything, in-flight requests included."),
        image("docker-stop-pid1", {
            alt: "Two timelines of docker stop api. Top, red, CMD [\"./start.sh\"] without exec: PID 1 is /bin/sh start.sh and gunicorn is its child PID 7. At 0 seconds docker sends SIGTERM to PID 1; the shell has no handler, so as PID 1 it ignores the signal and never forwards it; gunicorn keeps serving. At 10 seconds the grace period ends and docker sends SIGKILL; everything dies at once, in-flight orders are cut off, exit code 137. Bottom, green, start.sh ends with exec gunicorn: the shell is replaced, gunicorn is PID 1. At 0 seconds gunicorn receives SIGTERM, stops accepting new connections, finishes the requests it is serving and exits at about 1.2 seconds with exit code 0.",
            caption: "Whoever is PID 1 receives docker stop's SIGTERM. Make sure it is the program that knows how to shut down.",
        }),
        h3("Fix 1: exec the real program"),
        p("The shell's `exec` builtin **replaces** the shell with the program instead of starting a child. Same PID, so gunicorn becomes PID 1 and receives SIGTERM itself:"),
        code("bash", `
#!/bin/sh
set -eu
python manage.py migrate --check
exec gunicorn api:app --bind 0.0.0.0:8000     # gunicorn takes over PID 1`, "start.sh"),
        code("bash", `
$ time docker stop api
api

real    0m1.418s
user    0m0.029s
sys     0m0.018s
$ docker ps -a --filter name=api --format '{{.Status}}'
Exited (0) 3 seconds ago`),
        h3("Fix 2: exec form, not shell form"),
        p("The same problem hides in the Dockerfile itself. `CMD` and `ENTRYPOINT` have two forms:"),
        code("dockerfile", `
# shell form: Docker runs /bin/sh -c "gunicorn api:app --bind 0.0.0.0:8000"
CMD gunicorn api:app --bind 0.0.0.0:8000

# exec form (a JSON array): Docker runs gunicorn directly, as PID 1
CMD ["gunicorn", "api:app", "--bind", "0.0.0.0:8000"]`),
        p("With the shell form, PID 1 is a shell and your program is (usually) its child - the incident again. Some shells replace themselves with a single simple command, but do not rely on it: one `&&` in the command and the shell stays. Use the exec form, with double quotes, for `CMD` and `ENTRYPOINT`."),
        h3("Fix 3: a tiny init process"),
        p("`docker run --init` (or `init: true` in Compose) starts a minimal init program, tini, as PID 1. It forwards signals to your process and reaps zombie processes. It is a good safety net when you cannot change the image's command."),
        callout("warning", "137 is not always out of memory",
            "The kernel's OOM killer also ends a process with SIGKILL, so an out-of-memory container exits with 137 too. Before you raise the memory limit, check: docker inspect --format '{{.State.OOMKilled}}' api prints true only when memory was the reason."),

        h2("8. Handling SIGTERM in Python"),
        p("If your own Python program is PID 1 - `CMD [\"python\", \"dispatch_worker.py\"]` - remember the PID 1 rule: Python installs a handler for SIGINT (that is how `KeyboardInterrupt` works) but **not for SIGTERM**. Without one, `docker stop` waits 10 seconds and kills the worker in the middle of an order. The `signal` module lets you install a handler:"),
        code("python", `
import signal
import sys

stopping = False


def request_stop(signum, frame):
    global stopping
    print(f"got {signal.Signals(signum).name}, finishing the current order", flush=True)
    stopping = True          # do not exit here: let the loop finish its work


signal.signal(signal.SIGTERM, request_stop)

while not stopping:
    order = take_next_order(timeout=1)    # returns None after 1 s without work
    if order is not None:
        assign_driver(order)

print("dispatch worker stopped cleanly", flush=True)
sys.exit(0)`, "dispatch_worker.py"),
        bullets([
            "**Keep the handler tiny.** Set a flag and return; the main loop checks the flag between orders, so an order is never half-assigned.",
            "**Wake up regularly.** A loop that blocks forever waiting for work never sees the flag; a short timeout (1 second here) keeps it responsive.",
            "**Finish within the grace period.** If cleanup can take longer than 10 seconds, raise the grace period (`docker stop -t`, `stop_grace_period`) instead of hoping.",
        ]),

        h2("9. Your turn"),
        p("First, check that you can read a script and a container the way bash and the kernel do."),
        challenge("chal_quiz_devf_111", "For the script, ask after each line: what is $?, and does set -e stop here? For the container, ask: who is PID 1, and who receives SIGTERM?"),
        p("Then build the tool the on-call wished for on Friday: given the exit codes of every command in a CI job, report each step's status the way bash computes it (with or without pipefail), explain what the codes mean, and stop at the first failing step like `set -e`."),
        challenge("chal_coding_devf_112", "Write meaning(code) first and check the edges: 126, 127, 128, 129, 192 and 193. Then pipeline_status: without pipefail it is codes[-1]; with pipefail, keep the non-zero codes and take the last one. run_job only needs a variable that remembers the first failure."),

        h2("10. Pitfalls"),
        bullets([
            "**`cmd | tee log` without `pipefail`** reports `tee`'s status, so a failing `cmd` looks successful.",
            "**`set -e` with `&&`**: `./migrate.sh && echo ok` does not stop the script when the migration fails.",
            "**Shell-form `CMD` or a start script without `exec`**: PID 1 is a shell that ignores SIGTERM, every stop takes the full grace period and ends with 137.",
            "**A Python program as PID 1 without a SIGTERM handler** behaves the same way.",
            "**Using `kill -9` first**: SIGKILL skips every cleanup handler. Send SIGTERM, wait, and only then SIGKILL.",
            "**Reading 137 as \"out of memory\"** without checking `State.OOMKilled`.",
            "**Exit codes above 255** wrap around: `exit 256` is success.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every deploy or CI script starts with `set -euo pipefail`; GitHub Actions workflows set `shell: bash` so `run:` steps get `-eo pipefail`.",
            "Cleanup lives in a `trap '...' EXIT`.",
            "You can translate an exit code: 0 ok, 1-125 the program's error, 126 not executable, 127 not found, 128 + N killed by signal N.",
            "Containers use the exec form of `CMD`/`ENTRYPOINT`, and entrypoint scripts end with `exec` the real program.",
            "The program that is PID 1 handles SIGTERM and finishes within the grace period - or the container runs with `--init`.",
            "When a container exits with 137, you check `OOMKilled` before guessing.",
        ]),
    ],
});
