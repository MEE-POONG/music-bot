FROM oven/bun:1 AS base

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lockb tsconfig.json ./

RUN bun install --frozen-lockfile

COPY . .

RUN bunx prisma generate

ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
