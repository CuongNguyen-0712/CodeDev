# Build stage: everything needed to compile.
FROM node:24-slim AS build
WORKDIR /app
# [ ] Install dependencies from the lockfile
# [ ] Copy the sources, compile, then drop devDependencies

# Runtime stage: only what the server runs.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# [ ] Copy only what the server needs from the build stage
# [ ] Start node as PID 1, as a non-root user
