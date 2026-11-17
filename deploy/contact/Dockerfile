# Contact form mail handler (server.mjs). Rebuild after changes:
#   docker compose up -d --build
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./

USER node
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
