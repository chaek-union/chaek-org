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

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM base AS production

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN apt-get update && apt-get install -y gosu && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/books /app/static/books && \
    chown -R node:node /app/books /app/static/books

COPY entrypoint.sh /app/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "build"]
