FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN npm run build
USER node
CMD ["node", "dist/server.js"]
