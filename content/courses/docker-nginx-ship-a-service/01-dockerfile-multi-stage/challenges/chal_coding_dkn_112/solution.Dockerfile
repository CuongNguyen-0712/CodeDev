# Build stage: everything needed to compile.
FROM node:24-slim AS build
WORKDIR /app
# @piece install-deps: Install dependencies from the lockfile
COPY package.json package-lock.json ./
RUN npm ci
# @end
# @piece build-and-prune: Copy the sources, compile, then drop devDependencies
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
# @end

# Runtime stage: only what the server runs.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# @piece runtime-copy: Copy only what the server needs from the build stage
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# @end
# @piece run-as-node: Start node as PID 1, as a non-root user
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
# @end
