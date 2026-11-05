FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:24-slim
WORKDIR /app
COPY --from=build /app ./
USER node
CMD ["node", "dist/server.js"]
