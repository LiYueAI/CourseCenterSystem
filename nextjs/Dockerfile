FROM node:20-alpine AS builder
WORKDIR /app

ARG DATABASE_URL
ARG DIRECTUS_URL
ARG JWT_SECRET
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECTUS_URL=$DIRECTUS_URL
ENV JWT_SECRET=$JWT_SECRET

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache unzip

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
