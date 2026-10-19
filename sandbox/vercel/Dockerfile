# syntax=docker/dockerfile:1
# codedev-runner: Vercel Sandbox image (pushed to VCR) that grades challenge code, one VM per
# language with a few job slots each (docs/sandbox.md). Layout mirrors the Vercel managed
# `vercel/sandbox/ubuntu` image (user `ubuntu` with sudo, HOME /vercel); learner code runs as the
# slot users run01..run08 (no sudo) through /opt/codedev/run-job.
#
# Build context is sandbox/ (runner.cjs is shared with the Docker runner):
#   docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile -t codedev-runner:v1 --load sandbox
#   docker run --rm --init --network none codedev-runner:v1 node /opt/codedev/selftest.mjs
# Push (after `vercel vcr login docker --project codedev --scope codedevteam`):
#   docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile \
#     --output type=image,name=vcr.vercel.com/codedevteam/codedev/codedev-runner:v1,push=true,oci-mediatypes=true,compression=zstd sandbox
FROM ubuntu:26.04

ENV LANG=C.UTF-8
ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=24.11.1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates sudo curl xz-utils libatomic1 procps \
      python3 \
      gcc g++ libc6-dev \
      openjdk-21-jdk-headless \
      golang-go \
      rustc && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ --strip-components=1 -C /usr/local --exclude CHANGELOG.md --exclude LICENSE --exclude README.md

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
    javac -version && go version && rustc --version && prlimit --version

ENV HOME=/vercel SHELL=/bin/bash
USER ubuntu
WORKDIR /vercel
