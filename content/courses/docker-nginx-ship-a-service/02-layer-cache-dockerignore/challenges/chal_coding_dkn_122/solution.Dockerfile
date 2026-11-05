# Build stage: dependencies first (they change rarely), then the source (it changes on every commit).
FROM node:24-slim AS build
WORKDIR /app
# @piece copy-manifests-first: Copy only the files npm ci reads
COPY package.json package-lock.json ./
# @end
# @piece install-deps: Install dependencies from the lockfile
RUN npm ci
# @end
# @piece copy-source: Copy the files the compiler needs
COPY tsconfig.json ./
COPY src ./src
# @end
# @piece build-and-prune: Compile, then drop devDependencies
RUN npm run build && npm prune --omit=dev
# @end

# Runtime stage: only what the server runs.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
