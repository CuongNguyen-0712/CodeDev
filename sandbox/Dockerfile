# syntax=docker/dockerfile:1
# codedev_sandbox: runs untrusted challenge code. No npm dependencies, nothing from the app.
# Runtime hardening (read-only root, no capabilities, internal network, resource limits) is set
# on the service in compose.yml; see docs/sandbox.md.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=4100

WORKDIR /srv
COPY --chown=root:root --chmod=0444 server.mjs runner.cjs gateway.mjs ./

# The image's unprivileged `node` user (uid 1000). The files stay root-owned and read-only.
USER node

EXPOSE 4100

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.mjs"]
