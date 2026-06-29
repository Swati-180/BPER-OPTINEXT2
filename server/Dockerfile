FROM node:22-alpine AS deps
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /etc/passwd /etc/passwd
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
USER nodeuser
CMD ["node", "index.js"]
