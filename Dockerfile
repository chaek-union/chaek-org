# Base image with dependencies
FROM node:20-slim AS base

WORKDIR /app

# Install git for cloning repositories, pandoc for PDF generation, and Korean fonts
RUN apt-get update && apt-get install -y \
    git \
    pandoc \
    texlive-full \
    fontconfig \
    librsvg2-bin \
    curl \
    ca-certificates \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Copy KoPub World Dotum fonts
COPY fonts /usr/share/fonts/truetype/kopub
RUN fc-cache -fv

# Builder stage
FROM base AS builder

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM base AS production

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/books /app/static/books && \
    chown -R node:node /app/books /app/static/books

USER node

EXPOSE 3000

CMD ["node", "build"]
