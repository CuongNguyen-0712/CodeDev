# syntax=docker/dockerfile:1
# codedev-runner: Vercel Sandbox image (pushed to VCR) that grades challenge code, one VM per
# language with a few job slots each (docs/sandbox.md). Layout mirrors the Vercel managed
# `vercel/sandbox/ubuntu` image (user `ubuntu` with sudo, HOME /vercel); learner code runs as the
# slot users run01..run08 (no sudo) through /opt/codedev/run-job.
#
# The `docker` stage is codedev_sandbox: the same toolchains behind sandbox/server.mjs for compose.
#
# Build context is sandbox/ (runner.cjs is shared with the Docker runner):
#   docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile -t codedev-runner:v1 --load sandbox
#   docker run --rm --init --network none codedev-runner:v1 node /opt/codedev/selftest.mjs
# Push (after `vercel vcr login docker --project codedev --scope codedevteam`):
#   docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile \
#     --output type=image,name=vcr.vercel.com/codedevteam/codedev/codedev-runner:v1,push=true,oci-mediatypes=true,compression=zstd sandbox
FROM ubuntu:26.04 AS runner

ENV LANG=C.UTF-8
ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=24.11.1
ARG KOTLIN_VERSION=2.3.0
ARG KOTLIN_SHA256=ea16ab1cab29d419bf41b60ecc0e305d449fa661d9c05fbcc5b2a6672505456a
ARG KOTLINX_COROUTINES_VERSION=1.10.2
ARG KOTLINX_COROUTINES_SHA256=5ca175b38df331fd64155b35cd8cae1251fa9ee369709b36d42e0a288ccce3fd
ARG TYPESCRIPT_VERSION=5.9.3

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates sudo curl xz-utils unzip libatomic1 procps \
      python3 \
      php-cli php-mbstring \
      dotnet-sdk-10.0 \
      gcc g++ libc6-dev \
      openjdk-21-jdk-headless \
      golang-go \
      rustc && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ --strip-components=1 -C /usr/local --exclude CHANGELOG.md --exclude LICENSE --exclude README.md

# TypeScript: tsc type-checks (--strict) and emits main.js, which node runs; @types/node for stdin.
RUN npm install -g --no-fund --no-audit "typescript@${TYPESCRIPT_VERSION}" "@types/node@24" && npm cache clean --force

# Kotlin compiler (JVM, reuses OpenJDK 21) + kotlinx.coroutines; programs run as `java -cp out:<stdlib>:<coroutines> MainKt`.
RUN curl -fsSL -o /tmp/kotlin.zip "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" && \
    echo "${KOTLIN_SHA256}  /tmp/kotlin.zip" | sha256sum -c - && \
    unzip -q /tmp/kotlin.zip -d /opt && mv /opt/kotlinc /opt/kotlin && rm /tmp/kotlin.zip && \
    curl -fsSL -o /opt/kotlin/lib/kotlinx-coroutines-core.jar "https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/${KOTLINX_COROUTINES_VERSION}/kotlinx-coroutines-core-jvm-${KOTLINX_COROUTINES_VERSION}.jar" && \
    echo "${KOTLINX_COROUTINES_SHA256}  /opt/kotlin/lib/kotlinx-coroutines-core.jar" | sha256sum -c - && \
    # Class-data archive of kotlinc (read-only, used through JAVA_OPTS in run-job; same GC flags).
    echo 'fun main() { println(listOf(1, 2).map { it * 2 }.joinToString()) }' > /tmp/w.kt && \
    JAVA_OPTS="-Xmx512m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:-UsePerfData -XX:ArchiveClassesAtExit=/opt/kotlin/kotlinc.jsa -Dkotlin.colors.enabled=false" \
      /opt/kotlin/bin/kotlinc -nowarn -cp /opt/kotlin/lib/kotlinx-coroutines-core.jar -d /tmp/wout /tmp/w.kt && \
    rm -rf /tmp/w.kt /tmp/wout && chmod 0644 /opt/kotlin/kotlinc.jsa

# C#: Roslyn's csc.dll is called directly (no `dotnet build`/NuGet restore, much faster) with the
# shared framework's reference assemblies and implicit usings; main.dll runs on the shared runtime.
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
RUN set -e; mkdir -p /opt/codedev/csharp; cd /opt/codedev/csharp; \
    csc="$(ls -d /usr/lib/dotnet/sdk/*/Roslyn/bincore/csc.dll | sort -V | tail -1)"; \
    refs="$(ls -d /usr/lib/dotnet/packs/Microsoft.NETCore.App.Ref/*/ref/net* | sort -V | tail -1)"; \
    rt="$(ls /usr/lib/dotnet/shared/Microsoft.NETCore.App | sort -V | tail -1)"; \
    printf '#!/bin/sh\nexec /usr/bin/dotnet %s "$@"\n' "$csc" > csc; \
    for f in "$refs"/*.dll; do echo "-r:$f"; done > refs.rsp; \
    printf 'global using System;\nglobal using System.Collections.Generic;\nglobal using System.IO;\nglobal using System.Linq;\nglobal using System.Text;\nglobal using System.Threading.Tasks;\n' > GlobalUsings.cs; \
    printf '{"runtimeOptions":{"tfm":"net%s","framework":{"name":"Microsoft.NETCore.App","version":"%s"}}}\n' "${rt%.*}" "$rt" > main.runtimeconfig.json; \
    chmod 0755 csc; chmod 0644 refs.rsp GlobalUsings.cs main.runtimeconfig.json

# `ubuntu` drives the sandbox (sudo, like the managed images); run01..run08 run learner code: no
# sudo, no home, one per job slot, so concurrent jobs cannot read or signal each other.
RUN printf '%s\n' 'Defaults always_set_home' 'Defaults !env_reset' 'Defaults !fqdn' \
      'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/sandbox && \
    chmod 0440 /etc/sudoers.d/sandbox && \
    install -d -o ubuntu -g ubuntu /vercel && \
    usermod --home /vercel ubuntu && \
    install -d -o ubuntu -g ubuntu -m 0700 /vercel/jobs && \
    install -d -o root -g root -m 0711 /work && \
    for i in 1 2 3 4 5 6 7 8; do \
      useradd --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --uid "200$i" --user-group "run0$i"; \
    done && \
    # Only the sticky temp dirs stay world-writable (run-job cleans those); e.g. ubuntu:26.04 ships
    # /var/lib/pebble/default as 0777 without the sticky bit.
    find / -xdev \( -path /proc -o -path /sys -o -path /tmp -o -path /var/tmp -o -path /dev/shm -o -path /run/lock \) -prune \
      -o -type d -perm -0002 -exec chmod o-w {} +

# Pre-built Go standard library cache (root-owned, read-only); run-job gives every job its own copy.
ENV GOFLAGS=-trimpath GOTOOLCHAIN=local
RUN mkdir -p /opt/gocache && \
    printf 'package main\nimport ("bufio";"fmt";"os";"sort";"strconv";"strings";"encoding/json";"math")\nfunc main(){r:=bufio.NewReader(os.Stdin);_=r;fmt.Println(sort.IntsAreSorted(nil),strings.ToUpper("x"),strconv.Itoa(1),math.Sqrt(2));_,_=json.Marshal(1)}\n' > /tmp/w.go && \
    GOCACHE=/opt/gocache go build -o /tmp/w /tmp/w.go && rm -f /tmp/w /tmp/w.go && \
    chmod -R go-w,a+rX /opt/gocache

COPY --chown=root:root --chmod=0755 vercel/run-job /opt/codedev/run-job
COPY --chown=root:root --chmod=0644 runner.cjs vercel/selftest.mjs /opt/codedev/

RUN node --version && python3 --version && gcc --version | head -1 && g++ --version | head -1 && \
    javac -version && go version && rustc --version && prlimit --version && \
    php --version | head -1 && tsc --version && /opt/kotlin/bin/kotlinc -version 2>&1 | tail -1 && dotnet --list-runtimes

ENV HOME=/vercel SHELL=/bin/bash
USER ubuntu
WORKDIR /vercel

# ------------------------------------------------------------ codedev_sandbox (compose `sandbox`)
# server.mjs runs as root so run-job can switch to the slot users; compose drops every capability
# except the few run-job needs (docs/sandbox.md). Learner code never runs as root.
FROM runner AS docker
COPY --chown=root:root --chmod=0444 server.mjs gateway.mjs /opt/codedev/
ENV PORT=4100 RUN_JOB=/opt/codedev/run-job HOME=/root
USER root
WORKDIR /opt/codedev
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "/opt/codedev/server.mjs"]

# ------------------------------------------------------------ default target: the Vercel Sandbox image
FROM runner
