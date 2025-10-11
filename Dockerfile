FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install git for cloning repositories
RUN apk add --no-cache git

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/books /app/static/books && \
    chown -R node:node /app/books /app/static/books

USER node

EXPOSE 3000

CMD ["node", "build"]
