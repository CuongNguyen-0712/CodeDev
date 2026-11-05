# Build stage: dependencies first (they change rarely), then the source (it changes on every commit).
FROM node:24-slim AS build
WORKDIR /app
# [ ] Copy only the files npm ci reads
# [ ] Install dependencies from the lockfile
# [ ] Copy the files the compiler needs
# [ ] Compile, then drop devDependencies

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
